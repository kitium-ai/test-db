/**
 * @kitium-ai/test-db - MongoDB Helper functions
 */

import { Collection } from 'mongodb';

import { MongoDBTestDB } from './client.js';
import { MongoDBConfig } from '../types/index.js';
import { getMongoDBConfig } from '../utils/config.js';

/**
 * Create a MongoDB test database instance
 */
export function createMongoDBTestDB(config?: Partial<MongoDBConfig>): MongoDBTestDB {
  const fullConfig = getMongoDBConfig(config);
  return new MongoDBTestDB(fullConfig);
}

/**
 * Helper to insert documents
 */
export async function insertDocuments(
  database: MongoDBTestDB,
  collectionName: string,
  documents: Record<string, unknown>[]
): Promise<void> {
  const collection = (await database.collection(collectionName)) as Collection;
  if (documents.length > 0) {
    await collection.insertMany(documents);
  }
}

/**
 * Helper to find documents
 */
export async function findDocuments(
  database: MongoDBTestDB,
  collectionName: string,
  filter?: Record<string, unknown>
): Promise<unknown[]> {
  const collection = (await database.collection(collectionName)) as Collection;
  return collection.find(filter || {}).toArray();
}

/**
 * Helper to find one document
 */
export async function findOneDocument(
  database: MongoDBTestDB,
  collectionName: string,
  filter: Record<string, unknown>
): Promise<unknown> {
  const collection = (await database.collection(collectionName)) as Collection;
  return collection.findOne(filter);
}

/**
 * Helper to update documents
 */
export async function updateDocuments(
  database: MongoDBTestDB,
  collectionName: string,
  filter: Record<string, unknown>,
  update: Record<string, unknown>
): Promise<void> {
  const collection = (await database.collection(collectionName)) as Collection;
  await collection.updateMany(filter, { $set: update });
}

/**
 * Helper to delete documents
 */
export async function deleteDocuments(
  database: MongoDBTestDB,
  collectionName: string,
  filter: Record<string, unknown>
): Promise<void> {
  const collection = (await database.collection(collectionName)) as Collection;
  await collection.deleteMany(filter);
}

/**
 * Helper to count documents
 */
export async function countDocuments(
  database: MongoDBTestDB,
  collectionName: string,
  filter?: Record<string, unknown>
): Promise<number> {
  const collection = (await database.collection(collectionName)) as Collection;
  return collection.countDocuments(filter || {});
}

/**
 * Helper to clear collection
 */
export async function clearCollection(
  database: MongoDBTestDB,
  collectionName: string
): Promise<void> {
  await deleteDocuments(database, collectionName, {});
}

/**
 * Helper to create index
 */
export async function createIndex(
  database: MongoDBTestDB,
  collectionName: string,
  keys: Record<string, 1 | -1>,
  options?: Record<string, unknown>
): Promise<void> {
  const collection = (await database.collection(collectionName)) as Collection;
  await collection.createIndex(keys, options);
}

/**
 * Helper to setup test database with collections
 */
export async function setupTestDatabase(
  config?: Partial<MongoDBConfig>,
  collectionNames?: string[]
): Promise<MongoDBTestDB> {
  const database = createMongoDBTestDB(config);
  await database.connect();

  try {
    if (collectionNames) {
      for (const collectionName of collectionNames) {
        const collection = (await database.collection(collectionName)) as Collection;
        // Create collection by inserting and deleting a document
        await collection.insertOne({});
        await collection.deleteOne({});
      }
    }
  } catch (error) {
    await database.disconnect();
    throw error;
  }

  return database;
}

/**
 * Helper to teardown test database
 */
export async function teardownTestDatabase(
  database: MongoDBTestDB,
  collectionNames?: string[]
): Promise<void> {
  try {
    if (collectionNames) {
      for (const collectionName of collectionNames) {
        await database.dropCollection(collectionName);
      }
    } else {
      // Drop entire database if no collections specified
      await database.dropDatabase();
    }
  } finally {
    await database.disconnect();
  }
}

/**
 * Helper to aggregate documents
 */
export async function aggregate(
  database: MongoDBTestDB,
  collectionName: string,
  pipeline: Record<string, unknown>[]
): Promise<unknown[]> {
  const collection = (await database.collection(collectionName)) as Collection;
  return collection.aggregate(pipeline as never).toArray();
}
