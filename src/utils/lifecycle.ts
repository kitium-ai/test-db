import { randomUUID } from 'crypto';
import { measure } from '@kitiumai/scripts/utils';
import { getTestLogger } from '@kitiumai/test-core';
import type { PostgresConfig, MongoDBConfig } from '../types/index.js';
import { createPostgresTestDB } from '../postgres/helpers.js';
import { createMongoDBTestDB } from '../mongodb/helpers.js';
import type { PostgresTestDB } from '../postgres/client.js';
import type { MongoDBTestDB } from '../mongodb/client.js';
import { createTestDbConfigBuilder, type TestEnvironmentPreset } from './config.js';

const logger = getTestLogger();

const uniqueName = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${randomUUID().split('-')[0]}`;

export interface TemporaryPostgresOptions {
  preset?: TestEnvironmentPreset;
  databaseName?: string;
  prefix?: string;
  schemas?: Record<string, string>;
  overrides?: Partial<PostgresConfig>;
}

export interface TemporaryMongoOptions {
  preset?: TestEnvironmentPreset;
  databaseName?: string;
  prefix?: string;
  overrides?: Partial<MongoDBConfig>;
}

export async function withTemporaryPostgresDatabase(
  options: TemporaryPostgresOptions,
  handler: (db: PostgresTestDB, config: PostgresConfig) => Promise<void>
): Promise<void> {
  const builder = createTestDbConfigBuilder(options?.preset).withPostgres(options?.overrides ?? {});
  const baseConfig = builder.buildPostgres();
  const tempName = options?.databaseName ?? uniqueName(options?.prefix ?? 'kitium_pg_test');
  const adminConfig: PostgresConfig = { ...baseConfig, database: 'postgres' };
  const testConfig: PostgresConfig = { ...baseConfig, database: tempName };

  await createDatabase(adminConfig, tempName);

  const testDb = createPostgresTestDB(testConfig);
  logger.info('Temporary PostgreSQL database created', { database: tempName });

  try {
    await testDb.connect();
    await ensureSchemas(testDb, options?.schemas);

    await measure(`withTemporaryPostgresDatabase:${tempName}`, async () => {
      await handler(testDb, testConfig);
    });
  } finally {
    await testDb.disconnect();
    await dropDatabase(adminConfig, tempName);
    logger.info('Temporary PostgreSQL database dropped', { database: tempName });
  }
}

export async function withTemporaryMongoDatabase(
  options: TemporaryMongoOptions,
  handler: (db: MongoDBTestDB, config: MongoDBConfig) => Promise<void>
): Promise<void> {
  const builder = createTestDbConfigBuilder(options?.preset).withMongo(options?.overrides ?? {});
  const baseConfig = builder.buildMongo();
  const tempName = options?.databaseName ?? uniqueName(options?.prefix ?? 'kitium_mongo_test');
  const testConfig: MongoDBConfig = { ...baseConfig, database: tempName };
  const testDb = createMongoDBTestDB(testConfig);

  logger.info('Temporary MongoDB database created', { database: tempName });
  await testDb.connect();

  try {
    await measure(`withTemporaryMongoDatabase:${tempName}`, async () => {
      await handler(testDb, testConfig);
    });
  } finally {
    await testDb.dropDatabase();
    await testDb.disconnect();
    logger.info('Temporary MongoDB database dropped', { database: tempName });
  }
}

async function createDatabase(config: PostgresConfig, dbName: string): Promise<void> {
  const adminDb = createPostgresTestDB(config);
  await adminDb.connect();
  try {
    await adminDb.createDatabase(dbName);
  } finally {
    await adminDb.disconnect();
  }
}

async function dropDatabase(config: PostgresConfig, dbName: string): Promise<void> {
  const adminDb = createPostgresTestDB(config);
  await adminDb.connect();
  try {
    await adminDb.dropDatabase(dbName);
  } finally {
    await adminDb.disconnect();
  }
}

async function ensureSchemas(db: PostgresTestDB, schemas?: Record<string, string>): Promise<void> {
  if (!schemas) {
    return;
  }

  for (const [table, schema] of Object.entries(schemas)) {
    await db.query(`CREATE TABLE IF NOT EXISTS "${table}" ${schema}`);
  }
}
