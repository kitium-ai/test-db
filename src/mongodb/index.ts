/**
 * @kitium-ai/test-db - MongoDB module
 */

export type { IMongoDBTestDB, MongoDBConfig } from '../types/index.js';
export { MongoDBTestDB } from './client.js';
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
  setupTestDatabase,
  teardownTestDatabase,
  updateDocuments,
} from './helpers.js';
