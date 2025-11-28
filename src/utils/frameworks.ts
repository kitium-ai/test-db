import type { TestEnvironmentPreset } from './config.js';
import { createTestDbConfigBuilder } from './config.js';
import type { PostgresConfig, MongoDBConfig } from '../types/index.js';
import type { PostgresTestDB } from '../postgres/client.js';
import type { MongoDBTestDB } from '../mongodb/client.js';
import { createPostgresTransactionalHarness, withPerTestMongoDatabase, withWorkerPostgresDatabase } from './isolation.js';
import { applySqlFixtures, applyMongoFixtures, type MongoFixtureDocument } from './fixtures.js';
import { createMongoDBTestDB } from '../mongodb/helpers.js';

export interface JestVitestLifecycle {
  beforeAll: (cb: () => Promise<void>) => void;
  afterAll: (cb: () => Promise<void>) => void;
  beforeEach: (cb: () => Promise<void>) => void;
  afterEach: (cb: () => Promise<void>) => void;
}

export interface PostgresTestSetupOptions {
  preset?: TestEnvironmentPreset;
  overrides?: Partial<PostgresConfig>;
  schemas?: Record<string, string>;
  truncateTables?: string[];
  applyFixtures?: string[];
  useTransactionalIsolation?: boolean;
}

export const installPostgresTestHarness = (
  lifecycle: JestVitestLifecycle,
  options: PostgresTestSetupOptions,
  handler: (db: PostgresTestDB, config: PostgresConfig) => Promise<void>
): void => {
  const { getDb } = withWorkerPostgresDatabase(lifecycle, {
    preset: options.preset,
    overrides: options.overrides,
    schemas: options.schemas,
  });

  lifecycle.beforeAll(async () => {
    const db = getDb();
    const config = db.getConfig();
    if (options.applyFixtures?.length) {
      await applySqlFixtures(db, options.applyFixtures);
    }
    await handler(db, config);
  });

  if (options.useTransactionalIsolation) {
    const harness = createPostgresTransactionalHarness(getDb(), { tablesToTruncate: options.truncateTables });
    lifecycle.beforeEach(harness.beforeEach);
    lifecycle.afterEach(harness.afterEach);
  } else if (options.truncateTables?.length) {
    lifecycle.afterEach(async () => {
      const db = getDb();
      await db.truncateTables(options.truncateTables ?? []);
    });
  }
};

export interface MongoTestSetupOptions {
  preset?: TestEnvironmentPreset;
  overrides?: Partial<MongoDBConfig>;
  fixtures?: MongoFixtureDocument[];
  perTestDatabase?: boolean;
}

export const installMongoTestHarness = (
  lifecycle: JestVitestLifecycle,
  options: MongoTestSetupOptions,
  handler: (db: MongoDBTestDB, config: MongoDBConfig) => Promise<void>
): void => {
  if (options.perTestDatabase) {
    const { getDb } = withPerTestMongoDatabase(
      { preset: options.preset, overrides: options.overrides },
      { beforeEach: lifecycle.beforeEach, afterEach: lifecycle.afterEach }
    );

    lifecycle.beforeEach(async () => {
      const db = getDb();
      const config = db.getConfig();
      if (options.fixtures?.length) {
        await applyMongoFixtures(db, options.fixtures);
      }
      await handler(db, config);
    });
    return;
  }

  const builder = createTestDbConfigBuilder(options?.preset).withMongo(options?.overrides ?? {});
  let db: MongoDBTestDB;
  let config: MongoDBConfig;

  lifecycle.beforeAll(async () => {
    config = builder.buildMongo();
    db = createMongoDBTestDB(config);
    await db.connect();
    if (options.fixtures?.length) {
      await applyMongoFixtures(db, options.fixtures);
    }
    await handler(db, config);
  });

  lifecycle.afterAll(async () => {
    if (!db) {
      return;
    }
    await db.dropDatabase();
    await db.disconnect();
  });
};
