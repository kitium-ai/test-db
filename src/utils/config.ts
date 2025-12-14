/**
 * @kitium-ai/test-db - Configuration utilities
 */

import packageTemplate from '@kitiumai/config/packageBase.cjs';
import { deepMerge, getConfigManager, sanitizeForLogging } from '@kitiumai/test-core';

import { MongoDBConfig, PostgresConfig } from '../types/index.js';
import { createLogger } from './logging.js';

const configManager = getConfigManager();
const logger = createLogger('TestDB:Config');
const MIN_NODE_VERSION = packageTemplate.engines?.node ?? '>=18.0.0';

const SENSITIVE_POSTGRES_KEYS = ['password'];
const SENSITIVE_MONGO_KEYS = ['uri'];

const baseCiHost = (): string => (configManager.get('ci') ? 'postgres' : 'localhost');

/**
 * Get PostgreSQL configuration from environment variables
 */
export function getPostgresConfig(overrides?: Partial<PostgresConfig>): PostgresConfig {
  const environment = process.env;
  const sharedTimeout = configManager.get('timeout') ?? 5000;
  const defaults: PostgresConfig = {
    host: environment['POSTGRES_HOST'] || baseCiHost(),
    port: parseInt(environment['POSTGRES_PORT'] || '5432', 10),
    username: environment['POSTGRES_USER'] || 'postgres',
    password: environment['POSTGRES_PASSWORD'] || 'postgres',
    database: environment['POSTGRES_DB'] || 'test_db',
    ssl: environment['POSTGRES_SSL'] === 'true',
    connectionTimeout: parseInt(
      environment['POSTGRES_CONNECTION_TIMEOUT'] || String(sharedTimeout),
      10
    ),
    idleTimeout: parseInt(environment['POSTGRES_IDLE_TIMEOUT'] || '30000', 10),
    maxConnections: parseInt(environment['POSTGRES_MAX_CONNECTIONS'] || '20', 10),
  };

  const merged = deepMerge(defaults, overrides ?? {});
  const sanitized = sanitizePostgresConfig(merged);
  logger.debug('Resolved PostgreSQL configuration', sanitized);
  logger.info('PostgreSQL configuration loaded', { node: MIN_NODE_VERSION });
  return merged;
}

/**
 * Get MongoDB configuration from environment variables
 */
export function getMongoDBConfig(overrides?: Partial<MongoDBConfig>): MongoDBConfig {
  const environment = process.env;
  const defaultUri = `mongodb://${environment['MONGO_USER'] || 'root'}:${environment['MONGO_PASSWORD'] || 'root'}@${
    environment['MONGO_HOST'] || baseCiHost()
  }:${environment['MONGO_PORT'] || 27017}`;

  const defaults: MongoDBConfig = {
    uri: environment['MONGO_URI'] || defaultUri,
    database: environment['MONGO_DB'] || 'test_db',
    connectionTimeout: parseInt(environment['MONGO_CONNECTION_TIMEOUT'] || '5000', 10),
    serverSelectionTimeout: parseInt(environment['MONGO_SERVER_SELECTION_TIMEOUT'] || '5000', 10),
  };

  const merged = deepMerge(defaults, overrides ?? {});
  const sanitized = sanitizeMongoDBConfig(merged);
  logger.debug('Resolved MongoDB configuration', sanitized);
  logger.info('MongoDB configuration loaded', { node: MIN_NODE_VERSION });
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
  return sanitizeForLogging(config, SENSITIVE_POSTGRES_KEYS) as Record<string, unknown>;
}

/**
 * Sanitize MongoDB configuration for logging
 */
export function sanitizeMongoDBConfig(config: MongoDBConfig): Record<string, unknown> {
  return sanitizeForLogging(config, SENSITIVE_MONGO_KEYS) as Record<string, unknown>;
}

export type TestEnvironmentPreset = 'local' | 'ci' | 'staging';

const inferDefaultPreset = (): TestEnvironmentPreset => (configManager.get('ci') ? 'ci' : 'local');

const presetDefaults: Record<
  TestEnvironmentPreset,
  { postgres: Partial<PostgresConfig>; mongo: Partial<MongoDBConfig> }
> = {
  local: {
    postgres: { host: process.env['POSTGRES_HOST'] || 'localhost', ssl: false },
    mongo: {
      uri:
        process.env['MONGO_URI'] ||
        `mongodb://${process.env['MONGO_USER'] || 'root'}:${process.env['MONGO_PASSWORD'] || 'root'}@${
          process.env['MONGO_HOST'] || 'localhost'
        }:${process.env['MONGO_PORT'] || 27017}`,
    },
  },
  ci: {
    postgres: { host: 'postgres', ssl: false },
    mongo: {
      uri:
        process.env['MONGO_URI'] ||
        `mongodb://${process.env['MONGO_USER'] || 'root'}:${process.env['MONGO_PASSWORD'] || 'root'}@mongo:27017`,
    },
  },
  staging: {
    postgres: {
      host:
        process.env['STAGING_POSTGRES_HOST'] ||
        process.env['POSTGRES_HOST'] ||
        process.env['POSTGRES_STAGING_HOST'] ||
        'staging-postgres',
      ssl: true,
    },
    mongo: {
      uri:
        process.env['STAGING_MONGO_URI'] ||
        `mongodb://${process.env['MONGO_USER'] || 'root'}:${process.env['MONGO_PASSWORD'] || 'root'}@${
          process.env['MONGO_HOST'] || 'staging-mongo'
        }:${process.env['MONGO_PORT'] || 27017}`,
    },
  },
};

const resolvePreset = (preset?: TestEnvironmentPreset): TestEnvironmentPreset =>
  preset && presetDefaults[preset] ? preset : inferDefaultPreset();

export function createPostgresPreset(
  preset?: TestEnvironmentPreset,
  overrides?: Partial<PostgresConfig>
): PostgresConfig {
  const target = resolvePreset(preset);
  return getPostgresConfig({
    ...presetDefaults[target].postgres,
    ...overrides,
  });
}

export function createMongoPreset(
  preset?: TestEnvironmentPreset,
  overrides?: Partial<MongoDBConfig>
): MongoDBConfig {
  const target = resolvePreset(preset);
  return getMongoDBConfig({
    ...presetDefaults[target].mongo,
    ...overrides,
  });
}

export class TestDbConfigBuilder {
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

export const createTestDbConfigBuilder = (preset?: TestEnvironmentPreset): TestDbConfigBuilder =>
  new TestDbConfigBuilder(preset);
