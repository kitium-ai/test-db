import type { MongoDBTestDB } from '../mongodb/client.js';
import { createMongoDBTestDB } from '../mongodb/helpers.js';
import type { PostgresTestDB } from '../postgres/client.js';
import type { MongoDBConfig, PostgresConfig } from '../types/index.js';
import {
  createTestDbConfigBuilder as createTestDatabaseConfigBuilder,
  type TestEnvironmentPreset,
} from './config.js';
import { applyMongoFixtures, applySqlFixtures, type MongoFixtureDocument } from './fixtures.js';
import {
  createPostgresTransactionalHarness,
  withPerTestMongoDatabase,
  withWorkerPostgresDatabase,
} from './isolation.js';

export type JestVitestLifecycle = {
  beforeAll: (callback: () => Promise<void>) => void;
  afterAll: (callback: () => Promise<void>) => void;
  beforeEach: (callback: () => Promise<void>) => void;
  afterEach: (callback: () => Promise<void>) => void;
};

export type PostgresTestSetupOptions = {
  preset?: TestEnvironmentPreset;
  overrides?: Partial<PostgresConfig>;
  schemas?: Record<string, string>;
  truncateTables?: string[];
  applyFixtures?: string[];
  useTransactionalIsolation?: boolean;
};

export const installPostgresTestHarness = (
  lifecycle: JestVitestLifecycle,
  options: PostgresTestSetupOptions,
  handler: (database: PostgresTestDB, config: PostgresConfig) => Promise<void>
): void => {
  const { getDb } = withWorkerPostgresDatabase(lifecycle, {
    ...(options.preset ? { preset: options.preset } : {}),
    ...(options.overrides ? { overrides: options.overrides } : {}),
    ...(options.schemas ? { schemas: options.schemas } : {}),
  });

  lifecycle.beforeAll(async () => {
    const database = getDb();
    const config = database.getConfig();
    if (options.applyFixtures?.length) {
      await applySqlFixtures(database, options.applyFixtures);
    }
    await handler(database, config);
  });

  if (options.useTransactionalIsolation) {
    const harness = createPostgresTransactionalHarness(getDb(), {
      ...(options.truncateTables ? { tablesToTruncate: options.truncateTables } : {}),
    });
    lifecycle.beforeEach(harness.beforeEach);
    lifecycle.afterEach(harness.afterEach);
  } else if (options.truncateTables?.length) {
    lifecycle.afterEach(async () => {
      const database = getDb();
      await database.truncateTables(options.truncateTables ?? []);
    });
  }
};

export type MongoTestSetupOptions = {
  preset?: TestEnvironmentPreset;
  overrides?: Partial<MongoDBConfig>;
  fixtures?: MongoFixtureDocument[];
  perTestDatabase?: boolean;
};

export const installMongoTestHarness = (
  lifecycle: JestVitestLifecycle,
  options: MongoTestSetupOptions,
  handler: (database: MongoDBTestDB, config: MongoDBConfig) => Promise<void>
): void => {
  if (options.perTestDatabase) {
    const { getDb } = withPerTestMongoDatabase(
      {
        ...(options.preset ? { preset: options.preset } : {}),
        ...(options.overrides ? { overrides: options.overrides } : {}),
      },
      { beforeEach: lifecycle.beforeEach, afterEach: lifecycle.afterEach }
    );

    lifecycle.beforeEach(async () => {
      const database = getDb();
      const config = database.getConfig();
      if (options.fixtures?.length) {
        await applyMongoFixtures(database, options.fixtures);
      }
      await handler(database, config);
    });
    return;
  }

  const builder = createTestDatabaseConfigBuilder(options?.preset).withMongo(
    options?.overrides ?? {}
  );
  let database: MongoDBTestDB;
  let config: MongoDBConfig;

  lifecycle.beforeAll(async () => {
    config = builder.buildMongo();
    database = createMongoDBTestDB(config);
    await database.connect();
    if (options.fixtures?.length) {
      await applyMongoFixtures(database, options.fixtures);
    }
    await handler(database, config);
  });

  lifecycle.afterAll(async () => {
    if (!database) {
      return;
    }
    await database.dropDatabase();
    await database.disconnect();
  });
};
