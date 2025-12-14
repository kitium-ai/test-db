import { randomUUID } from 'node:crypto';

import type { PoolClient } from 'pg';

import type { MongoDBTestDB } from '../mongodb/client.js';
import { createMongoDBTestDB } from '../mongodb/helpers.js';
import type { PostgresTestDB } from '../postgres/client.js';
import { createPostgresTestDB } from '../postgres/helpers.js';
import type { MongoDBConfig, PostgresConfig } from '../types/index.js';
import {
  createTestDbConfigBuilder as createTestDatabaseConfigBuilder,
  type TestEnvironmentPreset,
} from './config.js';
import { withSpan } from './telemetry.js';

export type TransactionalHarness = {
  beforeEach: () => Promise<void>;
  afterEach: () => Promise<void>;
};

export type PostgresIsolationOptions = {
  tablesToTruncate?: string[];
};

export const createPostgresTransactionalHarness = (
  database: PostgresTestDB,
  options?: PostgresIsolationOptions
): TransactionalHarness => {
  let client: PoolClient | null = null;

  return {
    beforeEach: async () => {
      client = await database.leaseClient();
      if (!client) {
        throw new Error('Failed to lease database client');
      }
      const activeClient = client;
      await withSpan('postgres.per-test.begin', () => activeClient.query('BEGIN'));
    },
    afterEach: async () => {
      if (!client) {
        return;
      }
      const activeClient = client;
      try {
        if (options?.tablesToTruncate?.length) {
          const quoted = options.tablesToTruncate.map((t) => `"${t}"`).join(', ');
          await activeClient.query(`TRUNCATE TABLE ${quoted} CASCADE`);
        }
        await withSpan('postgres.per-test.rollback', () => activeClient.query('ROLLBACK'));
      } finally {
        activeClient.release();
        client = null;
      }
    },
  };
};

export type MongoIsolationOptions = {
  prefix?: string;
  preset?: TestEnvironmentPreset;
  overrides?: Partial<MongoDBConfig>;
};

export const withPerTestMongoDatabase = (
  options: MongoIsolationOptions,
  lifecycle: {
    beforeEach: (callback: () => Promise<void>) => void;
    afterEach: (callback: () => Promise<void>) => void;
  }
): { getDb: () => MongoDBTestDB } => {
  const builder = createTestDatabaseConfigBuilder(options?.preset).withMongo(
    options?.overrides ?? {}
  );
  let database_: MongoDBTestDB;

  lifecycle.beforeEach(async () => {
    const baseConfig = builder.buildMongo();
    const database = `${options?.prefix ?? 'kitium_test'}_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    database_ = createMongoDBTestDB({ ...baseConfig, database });
    await withSpan('mongodb.per-test.connect', () => database_.connect());
  });

  lifecycle.afterEach(async () => {
    if (!database_) {
      return;
    }
    await withSpan('mongodb.per-test.teardown', async () => {
      await database_.dropDatabase();
      await database_.disconnect();
    });
  });

  return { getDb: () => database_ };
};

export type PostgresHarnessOptions = {
  preset?: TestEnvironmentPreset;
  overrides?: Partial<PostgresConfig>;
  databaseName?: string;
  schemas?: Record<string, string>;
  tablesToTruncate?: string[];
};

export const withWorkerPostgresDatabase = (
  lifecycle: {
    beforeAll: (callback: () => Promise<void>) => void;
    afterAll: (callback: () => Promise<void>) => void;
  },
  options?: PostgresHarnessOptions
): { getDb: () => PostgresTestDB } => {
  const builder = createTestDatabaseConfigBuilder(options?.preset).withPostgres(
    options?.overrides ?? {}
  );
  const baseConfig = builder.buildPostgres();
  const database = options?.databaseName ?? `${randomUUID().replace(/-/g, '').slice(0, 8)}_kitium`;
  let database_: PostgresTestDB;

  lifecycle.beforeAll(async () => {
    const adminConfig: PostgresConfig = { ...baseConfig, database: 'postgres' };
    const adminDatabase = createPostgresTestDB(adminConfig);
    await adminDatabase.connect();
    try {
      await adminDatabase.createDatabase(database);
    } finally {
      await adminDatabase.disconnect();
    }

    database_ = createPostgresTestDB({ ...baseConfig, database });
    await withSpan('postgres.worker.connect', () => database_.connect());

    if (options?.schemas) {
      for (const [table, schema] of Object.entries(options.schemas)) {
        await database_.query(`CREATE TABLE IF NOT EXISTS "${table}" ${schema}`);
      }
    }
  });

  lifecycle.afterAll(async () => {
    if (!database_) {
      return;
    }
    await withSpan('postgres.worker.teardown', async () => {
      await database_.disconnect();
      const adminConfig: PostgresConfig = { ...baseConfig, database: 'postgres' };
      const adminDatabase = createPostgresTestDB(adminConfig);
      await adminDatabase.connect();
      try {
        await adminDatabase.dropDatabase(database);
      } finally {
        await adminDatabase.disconnect();
      }
    });
  });

  return { getDb: () => database_ };
};
