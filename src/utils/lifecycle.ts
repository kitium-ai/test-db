import { randomUUID } from 'node:crypto';
import { measure } from '@kitiumai/scripts/utils';
import { getTestLogger } from '@kitiumai/test-core';

import { createMongoDBTestDB } from '../mongodb/helpers.js';
import type { MongoDBTestDB } from '../mongodb/client.js';
import type { PostgresTestDB } from '../postgres/client.js';

import { createPostgresTestDB } from '../postgres/helpers.js';

import type { MongoDBConfig, PostgresConfig } from '../types/index.js';

import {
  createTestDbConfigBuilder as createTestDatabaseConfigBuilder,
  type TestEnvironmentPreset,
} from './config.js';

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
  handler: (database: PostgresTestDB, config: PostgresConfig) => Promise<void>
): Promise<void> {
  const builder = createTestDatabaseConfigBuilder(options?.preset).withPostgres(
    options?.overrides ?? {}
  );
  const baseConfig = builder.buildPostgres();
  const temporaryName = options?.databaseName ?? uniqueName(options?.prefix ?? 'kitium_pg_test');
  const adminConfig: PostgresConfig = { ...baseConfig, database: 'postgres' };
  const testConfig: PostgresConfig = { ...baseConfig, database: temporaryName };

  await createDatabase(adminConfig, temporaryName);

  const testDatabase = createPostgresTestDB(testConfig);
  logger.info('Temporary PostgreSQL database created', { database: temporaryName });

  try {
    await testDatabase.connect();
    await ensureSchemas(testDatabase, options?.schemas);

    await measure(`withTemporaryPostgresDatabase:${temporaryName}`, async () => {
      await handler(testDatabase, testConfig);
    });
  } finally {
    await testDatabase.disconnect();
    await dropDatabase(adminConfig, temporaryName);
    logger.info('Temporary PostgreSQL database dropped', { database: temporaryName });
  }
}

export async function withTemporaryMongoDatabase(
  options: TemporaryMongoOptions,
  handler: (database: MongoDBTestDB, config: MongoDBConfig) => Promise<void>
): Promise<void> {
  const builder = createTestDatabaseConfigBuilder(options?.preset).withMongo(
    options?.overrides ?? {}
  );
  const baseConfig = builder.buildMongo();
  const temporaryName = options?.databaseName ?? uniqueName(options?.prefix ?? 'kitium_mongo_test');
  const testConfig: MongoDBConfig = { ...baseConfig, database: temporaryName };
  const testDatabase = createMongoDBTestDB(testConfig);

  logger.info('Temporary MongoDB database created', { database: temporaryName });
  await testDatabase.connect();

  try {
    await measure(`withTemporaryMongoDatabase:${temporaryName}`, async () => {
      await handler(testDatabase, testConfig);
    });
  } finally {
    await testDatabase.dropDatabase();
    await testDatabase.disconnect();
    logger.info('Temporary MongoDB database dropped', { database: temporaryName });
  }
}

async function createDatabase(config: PostgresConfig, databaseName: string): Promise<void> {
  const adminDatabase = createPostgresTestDB(config);
  await adminDatabase.connect();
  try {
    await adminDatabase.createDatabase(databaseName);
  } finally {
    await adminDatabase.disconnect();
  }
}

async function dropDatabase(config: PostgresConfig, databaseName: string): Promise<void> {
  const adminDatabase = createPostgresTestDB(config);
  await adminDatabase.connect();
  try {
    await adminDatabase.dropDatabase(databaseName);
  } finally {
    await adminDatabase.disconnect();
  }
}

async function ensureSchemas(
  database: PostgresTestDB,
  schemas?: Record<string, string>
): Promise<void> {
  if (!schemas) {
    return;
  }

  for (const [table, schema] of Object.entries(schemas)) {
    await database.query(`CREATE TABLE IF NOT EXISTS "${table}" ${schema}`);
  }
}
