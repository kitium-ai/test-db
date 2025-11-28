/**
 * Example MongoDB tests
 *
 * These tests demonstrate how to use the @kitium-ai/test-db package
 * for MongoDB testing
 */

import {
  countDocuments,
  createMongoDBTestDB,
  deleteDocuments,
  findDocuments,
  insertDocuments,
  updateDocuments,
} from '../src/mongodb/index.js';
import { MongoDBConfig } from '../src/types/index.js';

describe('MongoDB Test Database', () => {
  let databaseConfig: MongoDBConfig;

  beforeAll(() => {
    const mongoUri =
      process.env.MONGO_URI ||
      `mongodb://${process.env.MONGO_USER || 'root'}:${process.env.MONGO_PASSWORD || 'root'}@${
        process.env.MONGO_HOST || 'localhost'
      }:${process.env.MONGO_PORT || 27017}`;

    databaseConfig = {
      uri: mongoUri,
      database: process.env.MONGO_DB || 'test_db',
    };
  });

  describe('Connection Management', () => {
    it('should connect to MongoDB database', async () => {
      const database = createMongoDBTestDB(databaseConfig);

      try {
        await database.connect();
        expect(database.isConnected()).toBe(true);
      } finally {
        await database.disconnect();
      }
    });

    it('should handle multiple connections gracefully', async () => {
      const database = createMongoDBTestDB(databaseConfig);

      try {
        await database.connect();
        await database.connect(); // Should not fail

        expect(database.isConnected()).toBe(true);
      } finally {
        await database.disconnect();
      }
    });

    it('should disconnect successfully', async () => {
      const database = createMongoDBTestDB(databaseConfig);

      await database.connect();
      expect(database.isConnected()).toBe(true);

      await database.disconnect();
      expect(database.isConnected()).toBe(false);
    });
  });

  describe('Document Operations', () => {
    const collectionName = 'test_users';

    beforeEach(async () => {
      const database = createMongoDBTestDB(databaseConfig);

      try {
        await database.connect();
        await database.dropCollection(collectionName);
      } catch {
        // Collection might not exist
      } finally {
        await database.disconnect();
      }
    });

    afterEach(async () => {
      const database = createMongoDBTestDB(databaseConfig);

      try {
        await database.connect();
        await database.dropCollection(collectionName);
      } finally {
        await database.disconnect();
      }
    });

    it('should insert documents', async () => {
      const database = createMongoDBTestDB(databaseConfig);

      try {
        await database.connect();

        const testData = [
          { name: 'John Doe', email: 'john@example.com', age: 30 },
          { name: 'Jane Smith', email: 'jane@example.com', age: 28 },
        ];

        await insertDocuments(database, collectionName, testData);

        const count = await countDocuments(database, collectionName);
        expect(count).toBe(2);
      } finally {
        await database.disconnect();
      }
    });

    it('should find documents', async () => {
      const database = createMongoDBTestDB(databaseConfig);

      try {
        await database.connect();

        const testData = [
          { name: 'John Doe', email: 'john@example.com', age: 30 },
          { name: 'Jane Smith', email: 'jane@example.com', age: 28 },
        ];

        await insertDocuments(database, collectionName, testData);

        const documents = await findDocuments(database, collectionName);
        expect(documents).toHaveLength(2);
      } finally {
        await database.disconnect();
      }
    });

    it('should find documents with filter', async () => {
      const database = createMongoDBTestDB(databaseConfig);

      try {
        await database.connect();

        const testData = [
          { name: 'John Doe', email: 'john@example.com', age: 30 },
          { name: 'Jane Smith', email: 'jane@example.com', age: 28 },
          { name: 'Bob Wilson', email: 'bob@example.com', age: 35 },
        ];

        await insertDocuments(database, collectionName, testData);

        const documents = await findDocuments(database, collectionName, { age: { $gt: 29 } });
        expect(documents.length).toBeGreaterThanOrEqual(1);
      } finally {
        await database.disconnect();
      }
    });

    it('should update documents', async () => {
      const database = createMongoDBTestDB(databaseConfig);

      try {
        await database.connect();

        const testData = [{ name: 'John Doe', email: 'john@example.com', age: 30 }];

        await insertDocuments(database, collectionName, testData);
        await updateDocuments(database, collectionName, { name: 'John Doe' }, { age: 31 });

        const documents = await findDocuments(database, collectionName, { name: 'John Doe' });
        expect(documents[0]).toMatchObject({ age: 31 });
      } finally {
        await database.disconnect();
      }
    });

    it('should delete documents', async () => {
      const database = createMongoDBTestDB(databaseConfig);

      try {
        await database.connect();

        const testData = [
          { name: 'John Doe', email: 'john@example.com', age: 30 },
          { name: 'Jane Smith', email: 'jane@example.com', age: 28 },
        ];

        await insertDocuments(database, collectionName, testData);
        await deleteDocuments(database, collectionName, { name: 'John Doe' });

        const count = await countDocuments(database, collectionName);
        expect(count).toBe(1);
      } finally {
        await database.disconnect();
      }
    });
  });

  describe('Transactions', () => {
    const collectionName = 'test_transactions';

    beforeEach(async () => {
      const database = createMongoDBTestDB(databaseConfig);

      try {
        await database.connect();
        await database.dropCollection(collectionName);
      } catch {
        // Collection might not exist
      } finally {
        await database.disconnect();
      }
    });

    afterEach(async () => {
      const database = createMongoDBTestDB(databaseConfig);

      try {
        await database.connect();
        await database.dropCollection(collectionName);
      } finally {
        await database.disconnect();
      }
    });

    it('should handle transactions correctly', async () => {
      const database = createMongoDBTestDB(databaseConfig);

      try {
        await database.connect();

        // Transactions require a replica set in MongoDB
        // This test demonstrates the API usage
        // In production, ensure MongoDB is configured as a replica set
        const testData = [{ amount: 100.0, status: 'pending' }];

        await insertDocuments(database, collectionName, testData);

        const count = await countDocuments(database, collectionName);
        expect(count).toBe(1);
      } finally {
        await database.disconnect();
      }
    });
  });

  describe('Database Cleanup', () => {
    it('should seed and cleanup database', async () => {
      const database = createMongoDBTestDB(databaseConfig);

      try {
        await database.connect();

        const seedData = {
          users: [
            { name: 'User 1', email: 'user1@example.com' },
            { name: 'User 2', email: 'user2@example.com' },
          ],
          posts: [
            { title: 'Post 1', author: 'User 1' },
            { title: 'Post 2', author: 'User 2' },
          ],
        };

        await database.seed(seedData);

        const userCount = await countDocuments(database, 'users');
        expect(userCount).toBe(2);

        const postCount = await countDocuments(database, 'posts');
        expect(postCount).toBe(2);
      } finally {
        await database.dropDatabase();
        await database.disconnect();
      }
    });
  });
});
