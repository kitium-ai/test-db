/**
 * @kitium-ai/test-db
 *
 * Enterprise-ready test database utilities for PostgreSQL and MongoDB
 * Provides reusable test setup and methods for database testing
 */

// Core exports
export * from './types/index.js';

// PostgreSQL exports
export {
  PostgresTestDB,
  createPostgresTestDB,
  createTable,
  dropTable,
  insertData,
  fetchData,
  countRecords,
  updateData,
  deleteData,
  resetSequence,
  setupTestDatabase as setupPostgresTestDatabase,
  teardownTestDatabase as teardownPostgresTestDatabase,
} from './postgres/index.js';

// MongoDB exports
export {
  MongoDBTestDB,
  createMongoDBTestDB,
  insertDocuments,
  findDocuments,
  findOneDocument,
  updateDocuments,
  deleteDocuments,
  countDocuments,
  clearCollection,
  createIndex,
  setupTestDatabase as setupMongoDBTestDatabase,
  teardownTestDatabase as teardownMongoDBTestDatabase,
  aggregate,
} from './mongodb/index.js';

// Utilities exports
export { createLogger } from './utils/logging.js';
export {
  getPostgresConfig,
  getMongoDBConfig,
  validatePostgresConfig,
  validateMongoDBConfig,
  sanitizePostgresConfig,
  sanitizeMongoDBConfig,
  createPostgresPreset,
  createMongoPreset,
  createTestDbConfigBuilder,
  TestDbConfigBuilder,
  type TestEnvironmentPreset,
} from './utils/config.js';
export { withTemporaryPostgresDatabase, withTemporaryMongoDatabase } from './utils/lifecycle.js';
export { applySqlFixtures, applyMongoFixtures, snapshotTableSchema } from './utils/fixtures.js';
export {
  createPostgresTransactionalHarness,
  withPerTestMongoDatabase,
  withWorkerPostgresDatabase,
} from './utils/isolation.js';
export { installPostgresTestHarness, installMongoTestHarness } from './utils/frameworks.js';
export { withSpan } from './utils/telemetry.js';

// Version info
export const version = '1.0.0';
export const name = '@kitium-ai/test-db';
