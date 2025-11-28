/**
 * @kitium-ai/test-db - PostgreSQL module
 */

export type { IPostgresTestDB, PostgresConfig } from '../types/index.js';
export { PostgresTestDB } from './client.js';
export {
  countRecords,
  createPostgresTestDB,
  createTable,
  deleteData,
  dropTable,
  fetchData,
  insertData,
  resetSequence,
  setupTestDatabase,
  teardownTestDatabase,
  updateData,
} from './helpers.js';
