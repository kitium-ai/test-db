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
  countRecords,
  createPostgresTestDB,
  createTable,
  deleteData,
  dropTable,
  fetchData,
  insertData,
  PostgresTestDB,
  resetSequence,
  setupTestDatabase as setupPostgresTestDatabase,
  teardownTestDatabase as teardownPostgresTestDatabase,
  updateData,
} from './postgres/index.js';

// MongoDB exports
export {
  aggregate,
  clearCollection,
  countDocuments,
  createIndex,
  createMongoDBTestDB,
  deleteDocuments,
  findDocuments,
  findOneDocument,
  insertDocuments,
  MongoDBTestDB,
  setupTestDatabase as setupMongoDBTestDatabase,
  teardownTestDatabase as teardownMongoDBTestDatabase,
  updateDocuments,
} from './mongodb/index.js';

// Utilities exports
export {
  createMongoPreset,
  createPostgresPreset,
  createTestDbConfigBuilder,
  getMongoDBConfig,
  getPostgresConfig,
  sanitizeMongoDBConfig,
  sanitizePostgresConfig,
  TestDbConfigBuilder,
  type TestEnvironmentPreset,
  validateMongoDBConfig,
  validatePostgresConfig,
} from './utils/config.js';
export { applyMongoFixtures, applySqlFixtures, snapshotTableSchema } from './utils/fixtures.js';
export { installMongoTestHarness, installPostgresTestHarness } from './utils/frameworks.js';
export {
  createPostgresTransactionalHarness,
  withPerTestMongoDatabase,
  withWorkerPostgresDatabase,
} from './utils/isolation.js';
export { withTemporaryMongoDatabase, withTemporaryPostgresDatabase } from './utils/lifecycle.js';
export { createLogger } from './utils/logging.js';
export { withSpan } from './utils/telemetry.js';

// Version info
export const version = '1.0.0';
export const name = '@kitium-ai/test-db';
