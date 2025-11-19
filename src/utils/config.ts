/**
 * @kitium-ai/test-db - Configuration utilities
 */

import { PostgresConfig, MongoDBConfig } from '../types/index.js';

/**
 * Get PostgreSQL configuration from environment variables
 */
export function getPostgresConfig(overrides?: Partial<PostgresConfig>): PostgresConfig {
  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    username: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'test_db',
    ssl: process.env.POSTGRES_SSL === 'true',
    connectionTimeout: parseInt(process.env.POSTGRES_CONNECTION_TIMEOUT || '5000', 10),
    idleTimeout: parseInt(process.env.POSTGRES_IDLE_TIMEOUT || '30000', 10),
    maxConnections: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '20', 10),
    ...overrides,
  };
}

/**
 * Get MongoDB configuration from environment variables
 */
export function getMongoDBConfig(overrides?: Partial<MongoDBConfig>): MongoDBConfig {
  const defaultUri = `mongodb://${process.env.MONGO_USER || 'root'}:${
    process.env.MONGO_PASSWORD || 'root'
  }@${process.env.MONGO_HOST || 'localhost'}:${process.env.MONGO_PORT || 27017}`;

  return {
    uri: process.env.MONGO_URI || defaultUri,
    database: process.env.MONGO_DB || 'test_db',
    connectionTimeout: parseInt(process.env.MONGO_CONNECTION_TIMEOUT || '5000', 10),
    serverSelectionTimeout: parseInt(
      process.env.MONGO_SERVER_SELECTION_TIMEOUT || '5000',
      10
    ),
    ...overrides,
  };
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
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    ssl: config.ssl,
    connectionTimeout: config.connectionTimeout,
    idleTimeout: config.idleTimeout,
    maxConnections: config.maxConnections,
  };
}

/**
 * Sanitize MongoDB configuration for logging
 */
export function sanitizeMongoDBConfig(config: MongoDBConfig): Record<string, unknown> {
  return {
    database: config.database,
    connectionTimeout: config.connectionTimeout,
    serverSelectionTimeout: config.serverSelectionTimeout,
    uri: config.uri.replace(/:[^:]*@/, ':****@'), // Mask password
  };
}
