/**
 * @kitium-ai/test-db - Configuration utilities
 */

import packageTemplate from '@kitiumai/config/packageBase.cjs';
import { deepMerge, getConfigManager, sanitizeForLogging } from '@kitiumai/test-core';

import type { MongoDBConfig, PostgresConfig } from '../types/index.js';
import { createLogger } from './logging.js';

const configManager = getConfigManager();
const logger = createLogger('TestDB:Config');
const minNodeVersion = packageTemplate.engines?.node ?? '>=18.0.0';

const sensitivePostgresKeys = ['password'];
const sensitiveMongoKeys = ['uri'];

const baseCiHost = (): string => (configManager.get('ci') ? 'postgres' : 'localhost');

const readEnvironmentValue = (environment: NodeJS.ProcessEnv, key: string): string | undefined => {
  const value = environment[key];
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * Get PostgreSQL configuration from environment variables
 */
export function getPostgresConfig(overrides?: Partial<PostgresConfig>): PostgresConfig {
  const environment = process.env;
  const sharedTimeout = configManager.get('timeout') ?? 5000;
  const defaults: PostgresConfig = {
    host: readEnvironmentValue(environment, 'POSTGRES_HOST') ?? baseCiHost(),
    port: parseInt(readEnvironmentValue(environment, 'POSTGRES_PORT') ?? '5432', 10),
    username: readEnvironmentValue(environment, 'POSTGRES_USER') ?? 'postgres',
    password: readEnvironmentValue(environment, 'POSTGRES_PASSWORD') ?? 'postgres',
    database: readEnvironmentValue(environment, 'POSTGRES_DB') ?? 'test_db',
    ssl: environment['POSTGRES_SSL'] === 'true',
    connectionTimeout: parseInt(
      readEnvironmentValue(environment, 'POSTGRES_CONNECTION_TIMEOUT') ?? String(sharedTimeout),
      10
    ),
    idleTimeout: parseInt(
      readEnvironmentValue(environment, 'POSTGRES_IDLE_TIMEOUT') ?? '30000',
      10
    ),
    maxConnections: parseInt(
      readEnvironmentValue(environment, 'POSTGRES_MAX_CONNECTIONS') ?? '20',
      10
    ),
  };

  const merged = deepMerge(defaults, overrides ?? {});
  const sanitized = sanitizePostgresConfig(merged);
  logger.debug('Resolved PostgreSQL configuration', sanitized);
  logger.info('PostgreSQL configuration loaded', { node: minNodeVersion });
  return merged;
}

/**
 * Get MongoDB configuration from environment variables
 */
export function getMongoDBConfig(overrides?: Partial<MongoDBConfig>): MongoDBConfig {
  const environment = process.env;
  const mongoUser = readEnvironmentValue(environment, 'MONGO_USER') ?? 'root';
  const mongoPassword = readEnvironmentValue(environment, 'MONGO_PASSWORD') ?? 'root';
  const mongoHost = readEnvironmentValue(environment, 'MONGO_HOST') ?? baseCiHost();
  const mongoPort = readEnvironmentValue(environment, 'MONGO_PORT') ?? '27017';
  const defaultUri = `mongodb://${mongoUser}:${mongoPassword}@${mongoHost}:${mongoPort}`;

  const defaults: MongoDBConfig = {
    uri: readEnvironmentValue(environment, 'MONGO_URI') ?? defaultUri,
    database: readEnvironmentValue(environment, 'MONGO_DB') ?? 'test_db',
    connectionTimeout: parseInt(
      readEnvironmentValue(environment, 'MONGO_CONNECTION_TIMEOUT') ?? '5000',
      10
    ),
    serverSelectionTimeout: parseInt(
      readEnvironmentValue(environment, 'MONGO_SERVER_SELECTION_TIMEOUT') ?? '5000',
      10
    ),
  };

  const merged = deepMerge(defaults, overrides ?? {});
  const sanitized = sanitizeMongoDBConfig(merged);
  logger.debug('Resolved MongoDB configuration', sanitized);
  logger.info('MongoDB configuration loaded', { node: minNodeVersion });
  return merged;
}

/**
 * Validate database configuration
 */
export function validatePostgresConfig(config: PostgresConfig): boolean {
  return !!(config.host && config.port && config.username && config.database);
}

/**
 * Validate MongoDB configuration
 */
export function validateMongoDBConfig(config: MongoDBConfig): boolean {
  return !!(config.uri && config.database);
}

/**
 * Sanitize configuration for logging (removes sensitive data)
 */
export function sanitizePostgresConfig(config: PostgresConfig): Record<string, unknown> {
  return sanitizeForLogging(config, sensitivePostgresKeys) as Record<string, unknown>;
}

/**
 * Sanitize MongoDB configuration for logging
 */
export function sanitizeMongoDBConfig(config: MongoDBConfig): Record<string, unknown> {
  return sanitizeForLogging(config, sensitiveMongoKeys) as Record<string, unknown>;
}

export type TestEnvironmentPreset = 'local' | 'ci' | 'staging';

const inferDefaultPreset = (): TestEnvironmentPreset => (configManager.get('ci') ? 'ci' : 'local');

const buildMongoUri = (environment: NodeJS.ProcessEnv, hostFallback: string): string => {
  const user = readEnvironmentValue(environment, 'MONGO_USER') ?? 'root';
  const password = readEnvironmentValue(environment, 'MONGO_PASSWORD') ?? 'root';
  const host = readEnvironmentValue(environment, 'MONGO_HOST') ?? hostFallback;
  const port = readEnvironmentValue(environment, 'MONGO_PORT') ?? '27017';
  return `mongodb://${user}:${password}@${host}:${port}`;
};

const getLocalPresetDefaults = (
  environment: NodeJS.ProcessEnv
): { postgres: Partial<PostgresConfig>; mongo: Partial<MongoDBConfig> } => ({
  postgres: {
    host: readEnvironmentValue(environment, 'POSTGRES_HOST') ?? 'localhost',
    ssl: false,
  },
  mongo: {
    uri: readEnvironmentValue(environment, 'MONGO_URI') ?? buildMongoUri(environment, 'localhost'),
  },
});

const getCiPresetDefaults = (
  environment: NodeJS.ProcessEnv
): { postgres: Partial<PostgresConfig>; mongo: Partial<MongoDBConfig> } => ({
  postgres: { host: 'postgres', ssl: false },
  mongo: {
    uri: readEnvironmentValue(environment, 'MONGO_URI') ?? buildMongoUri(environment, 'mongo'),
  },
});

const getStagingPresetDefaults = (
  environment: NodeJS.ProcessEnv
): { postgres: Partial<PostgresConfig>; mongo: Partial<MongoDBConfig> } => ({
  postgres: {
    host:
      readEnvironmentValue(environment, 'STAGING_POSTGRES_HOST') ??
      readEnvironmentValue(environment, 'POSTGRES_HOST') ??
      readEnvironmentValue(environment, 'POSTGRES_STAGING_HOST') ??
      'staging-postgres',
    ssl: true,
  },
  mongo: {
    uri:
      readEnvironmentValue(environment, 'STAGING_MONGO_URI') ??
      readEnvironmentValue(environment, 'MONGO_URI') ??
      buildMongoUri(environment, 'staging-mongo'),
  },
});

const resolvePresetDefaults = (
  preset: TestEnvironmentPreset
): { postgres: Partial<PostgresConfig>; mongo: Partial<MongoDBConfig> } => {
  const environment = process.env;

  if (preset === 'local') {
    return getLocalPresetDefaults(environment);
  }

  if (preset === 'ci') {
    return getCiPresetDefaults(environment);
  }

  return getStagingPresetDefaults(environment);
};

const resolvePreset = (preset?: TestEnvironmentPreset): TestEnvironmentPreset =>
  preset ?? inferDefaultPreset();

export function createPostgresPreset(
  preset?: TestEnvironmentPreset,
  overrides?: Partial<PostgresConfig>
): PostgresConfig {
  const target = resolvePreset(preset);
  const defaults = resolvePresetDefaults(target);
  return getPostgresConfig({
    ...defaults.postgres,
    ...overrides,
  });
}

export function createMongoPreset(
  preset?: TestEnvironmentPreset,
  overrides?: Partial<MongoDBConfig>
): MongoDBConfig {
  const target = resolvePreset(preset);
  const defaults = resolvePresetDefaults(target);
  return getMongoDBConfig({
    ...defaults.mongo,
    ...overrides,
  });
}

class TestDatabaseConfigBuilder {
  private preset: TestEnvironmentPreset;
  private postgresOverrides: Partial<PostgresConfig> = {};
  private mongoOverrides: Partial<MongoDBConfig> = {};

  constructor(initialPreset?: TestEnvironmentPreset) {
    this.preset = resolvePreset(initialPreset);
  }

  environment(preset: TestEnvironmentPreset): this {
    this.preset = resolvePreset(preset);
    return this;
  }

  withPostgres(overrides: Partial<PostgresConfig>): this {
    this.postgresOverrides = { ...this.postgresOverrides, ...overrides };
    return this;
  }

  withMongo(overrides: Partial<MongoDBConfig>): this {
    this.mongoOverrides = { ...this.mongoOverrides, ...overrides };
    return this;
  }

  buildPostgres(): PostgresConfig {
    return createPostgresPreset(this.preset, this.postgresOverrides);
  }

  buildMongo(): MongoDBConfig {
    return createMongoPreset(this.preset, this.mongoOverrides);
  }
}

export { TestDatabaseConfigBuilder as TestDbConfigBuilder };

const createTestDatabaseConfigBuilder = (
  preset?: TestEnvironmentPreset
): TestDatabaseConfigBuilder => new TestDatabaseConfigBuilder(preset);

export { createTestDatabaseConfigBuilder as createTestDbConfigBuilder };
