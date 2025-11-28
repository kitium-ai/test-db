import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { createPostgresTestDB } from '../postgres/helpers.js';
import { createMongoDBTestDB } from '../mongodb/helpers.js';
import type { PostgresTestDB } from '../postgres/client.js';
import type { MongoDBTestDB } from '../mongodb/client.js';
import type { MongoDBConfig, PostgresConfig } from '../types/index.js';
import { createTestDbConfigBuilder, type TestEnvironmentPreset } from './config.js';
import { withSpan } from './telemetry.js';

export interface TransactionalHarness {
  beforeEach: () => Promise<void>;
  afterEach: () => Promise<void>;
}

export interface PostgresIsolationOptions {
  tablesToTruncate?: string[];
}

export const createPostgresTransactionalHarness = (
  db: PostgresTestDB,
  options?: PostgresIsolationOptions
): TransactionalHarness => {
  let client: PoolClient | null = null;

  return {
    beforeEach: async () => {
      client = await db.leaseClient();
      await withSpan('postgres.per-test.begin', () => client!.query('BEGIN'));
    },
    afterEach: async () => {
      if (!client) {
        return;
      }
      try {
        if (options?.tablesToTruncate?.length) {
          const quoted = options.tablesToTruncate.map((t) => `"${t}"`).join(', ');
          await client.query(`TRUNCATE TABLE ${quoted} CASCADE`);
        }
        await withSpan('postgres.per-test.rollback', () => client!.query('ROLLBACK'));
      } finally {
        client.release();
        client = null;
      }
    },
  };
};

export interface MongoIsolationOptions {
  prefix?: string;
  preset?: TestEnvironmentPreset;
  overrides?: Partial<MongoDBConfig>;
}

export const withPerTestMongoDatabase = (
  options: MongoIsolationOptions,
  lifecycle: { beforeEach: (cb: () => Promise<void>) => void; afterEach: (cb: () => Promise<void>) => void }
): { getDb: () => MongoDBTestDB } => {
  const builder = createTestDbConfigBuilder(options?.preset).withMongo(options?.overrides ?? {});
  let db: MongoDBTestDB;

  lifecycle.beforeEach(async () => {
    const baseConfig = builder.buildMongo();
    const database = `${options?.prefix ?? 'kitium_test'}_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    db = createMongoDBTestDB({ ...baseConfig, database });
    await withSpan('mongodb.per-test.connect', () => db.connect());
  });

  lifecycle.afterEach(async () => {
    if (!db) {
      return;
    }
    await withSpan('mongodb.per-test.teardown', async () => {
      await db.dropDatabase();
      await db.disconnect();
    });
  });

  return { getDb: () => db };
};

export interface PostgresHarnessOptions {
  preset?: TestEnvironmentPreset;
  overrides?: Partial<PostgresConfig>;
  databaseName?: string;
  schemas?: Record<string, string>;
  tablesToTruncate?: string[];
}

export const withWorkerPostgresDatabase = (
  lifecycle: { beforeAll: (cb: () => Promise<void>) => void; afterAll: (cb: () => Promise<void>) => void },
  options?: PostgresHarnessOptions
): { getDb: () => PostgresTestDB } => {
  const builder = createTestDbConfigBuilder(options?.preset).withPostgres(options?.overrides ?? {});
  const baseConfig = builder.buildPostgres();
  const database = options?.databaseName ?? `${randomUUID().replace(/-/g, '').slice(0, 8)}_kitium`; 
  let db: PostgresTestDB;

  lifecycle.beforeAll(async () => {
    const adminConfig: PostgresConfig = { ...baseConfig, database: 'postgres' };
    const adminDb = createPostgresTestDB(adminConfig);
    await adminDb.connect();
    try {
      await adminDb.createDatabase(database);
    } finally {
      await adminDb.disconnect();
    }

    db = createPostgresTestDB({ ...baseConfig, database });
    await withSpan('postgres.worker.connect', () => db.connect());

    if (options?.schemas) {
      for (const [table, schema] of Object.entries(options.schemas)) {
        await db.query(`CREATE TABLE IF NOT EXISTS "${table}" ${schema}`);
      }
    }
  });

  lifecycle.afterAll(async () => {
    if (!db) {
      return;
    }
    await withSpan('postgres.worker.teardown', async () => {
      await db.disconnect();
      const adminConfig: PostgresConfig = { ...baseConfig, database: 'postgres' };
      const adminDb = createPostgresTestDB(adminConfig);
      await adminDb.connect();
      try {
        await adminDb.dropDatabase(database);
      } finally {
        await adminDb.disconnect();
      }
    });
  });

  return { getDb: () => db };
};
