import type { ILogger as KitiumLogger } from '@kitiumai/logger';

/**
 * @kitium-ai/test-db - Type definitions
 */

/**
 * Database connection configuration
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

/**
 * PostgreSQL specific configuration
 */
export interface PostgresConfig extends DatabaseConfig {
  ssl?: boolean;
  connectionTimeout?: number;
  idleTimeout?: number;
  maxConnections?: number;
}

/**
 * MongoDB specific configuration
 */
export interface MongoDBConfig {
  uri: string;
  database: string;
  connectionTimeout?: number;
  serverSelectionTimeout?: number;
}

/**
 * Test database base interface
 */
export interface ITestDatabase {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  cleanup(): Promise<void>;
  seed(data: Record<string, unknown>): Promise<void>;
  execute(query: string, parameters?: unknown[]): Promise<unknown>;
}

/**
 * PostgreSQL test database interface
 */
export interface IPostgresTestDB extends ITestDatabase {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
  transaction(callback: (client: unknown) => Promise<void>): Promise<void>;
  transactionalTest(callback: (client: unknown) => Promise<void>): Promise<void>;
  leaseClient(): Promise<unknown>;
  truncateTables(tables: string[]): Promise<void>;
  createDatabase(databaseName: string): Promise<void>;
  dropDatabase(databaseName: string): Promise<void>;
  getConfig(): DatabaseConfig;
}

/**
 * MongoDB test database interface
 */
export interface IMongoDBTestDB extends ITestDatabase {
  collection(name: string): Promise<unknown>;
  dropCollection(name: string): Promise<void>;
  dropDatabase(): Promise<void>;
  transaction(callback: (session: unknown) => Promise<void>): Promise<void>;
  getConfig(): MongoDBConfig;
}

/**
 * Test result interface
 */
export interface TestResult {
  success: boolean;
  message?: string;
  error?: Error;
}

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
export interface SeedData {
  [collection: string]: unknown[];
}
