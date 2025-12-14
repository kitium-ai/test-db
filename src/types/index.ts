import type { ILogger as KitiumLogger } from '@kitiumai/logger';

/**
 * @kitium-ai/test-db - Type definitions
 */

/**
 * Database connection configuration
 */
export type DatabaseConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
};

/**
 * PostgreSQL specific configuration
 */
export type PostgresConfig = {
  ssl?: boolean;
  connectionTimeout?: number;
  idleTimeout?: number;
  maxConnections?: number;
} & DatabaseConfig;

/**
 * MongoDB specific configuration
 */
export type MongoDBConfig = {
  uri: string;
  database: string;
  connectionTimeout?: number;
  serverSelectionTimeout?: number;
};

/**
 * Test database base interface
 */
export type ITestDatabase = {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  cleanup(): Promise<void>;
  seed(data: Record<string, unknown>): Promise<void>;
  execute(query: string, parameters?: unknown[]): Promise<unknown>;
};

/**
 * PostgreSQL test database interface
 */
export type IPostgresTestDB = {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
  transaction(callback: (client: unknown) => Promise<void>): Promise<void>;
  transactionalTest(callback: (client: unknown) => Promise<void>): Promise<void>;
  leaseClient(): Promise<unknown>;
  truncateTables(tables: string[]): Promise<void>;
  createDatabase(databaseName: string): Promise<void>;
  dropDatabase(databaseName: string): Promise<void>;
  getConfig(): DatabaseConfig;
} & ITestDatabase;

/**
 * MongoDB test database interface
 */
export type IMongoDBTestDB = {
  collection(name: string): Promise<unknown>;
  dropCollection(name: string): Promise<void>;
  dropDatabase(): Promise<void>;
  transaction(callback: (session: unknown) => Promise<void>): Promise<void>;
  getConfig(): MongoDBConfig;
} & ITestDatabase;

/**
 * Test result interface
 */
export type TestResult = {
  success: boolean;
  message?: string;
  error?: Error;
};

/**
 * Connection state
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';

/**
 * Logger interface
 */
export type ILogger = KitiumLogger;

/**
 * Seed data interface
 */
export type SeedData = {
  [collection: string]: unknown[];
};
