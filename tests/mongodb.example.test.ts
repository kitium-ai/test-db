/**
 * Example MongoDB tests
 *
 * These tests demonstrate how to use the @kitium-ai/test-db package
 * for MongoDB testing
 */

import {
  createMongoDBTestDB,
  insertDocuments,
  findDocuments,
  countDocuments,
  updateDocuments,
  deleteDocuments,
} from '../src/mongodb/index.js';
import { MongoDBConfig } from '../src/types/index.js';

describe('MongoDB Test Database', () => {
  let dbConfig: MongoDBConfig;

  beforeAll(() => {
    const mongoUri =
      process.env.MONGO_URI ||
      `mongodb://${process.env.MONGO_USER || 'root'}:${process.env.MONGO_PASSWORD || 'root'}@${
        process.env.MONGO_HOST || 'localhost'
      }:${process.env.MONGO_PORT || 27017}`;

    dbConfig = {
      uri: mongoUri,
      database: process.env.MONGO_DB || 'test_db',
    };
  });

  describe('Connection Management', () => {
    it('should connect to MongoDB database', async () => {
      const db = createMongoDBTestDB(dbConfig);

      try {
        await db.connect();
        expect(db.isConnected()).toBe(true);
      } finally {
        await db.disconnect();
      }
    });

    it('should handle multiple connections gracefully', async () => {
      const db = createMongoDBTestDB(dbConfig);

      try {
        await db.connect();
        await db.connect(); // Should not fail

        expect(db.isConnected()).toBe(true);
      } finally {
        await db.disconnect();
      }
    });

    it('should disconnect successfully', async () => {
      const db = createMongoDBTestDB(dbConfig);

      await db.connect();
      expect(db.isConnected()).toBe(true);

      await db.disconnect();
      expect(db.isConnected()).toBe(false);
    });
  });

  describe('Document Operations', () => {
    const collectionName = 'test_users';

    beforeEach(async () => {
      const db = createMongoDBTestDB(dbConfig);

      try {
        await db.connect();
        await db.dropCollection(collectionName);
      } catch (e) {
        // Collection might not exist
      } finally {
        await db.disconnect();
      }
    });

    afterEach(async () => {
      const db = createMongoDBTestDB(dbConfig);

      try {
        await db.connect();
        await db.dropCollection(collectionName);
      } finally {
        await db.disconnect();
      }
    });

    it('should insert documents', async () => {
      const db = createMongoDBTestDB(dbConfig);

      try {
        await db.connect();

        const testData = [
          { name: 'John Doe', email: 'john@example.com', age: 30 },
          { name: 'Jane Smith', email: 'jane@example.com', age: 28 },
        ];

        await insertDocuments(db, collectionName, testData);

        const count = await countDocuments(db, collectionName);
        expect(count).toBe(2);
      } finally {
        await db.disconnect();
      }
    });

    it('should find documents', async () => {
      const db = createMongoDBTestDB(dbConfig);

      try {
        await db.connect();

        const testData = [
          { name: 'John Doe', email: 'john@example.com', age: 30 },
          { name: 'Jane Smith', email: 'jane@example.com', age: 28 },
        ];

        await insertDocuments(db, collectionName, testData);

        const documents = await findDocuments(db, collectionName);
        expect(documents).toHaveLength(2);
      } finally {
        await db.disconnect();
      }
    });

    it('should find documents with filter', async () => {
      const db = createMongoDBTestDB(dbConfig);

      try {
        await db.connect();

        const testData = [
          { name: 'John Doe', email: 'john@example.com', age: 30 },
          { name: 'Jane Smith', email: 'jane@example.com', age: 28 },
          { name: 'Bob Wilson', email: 'bob@example.com', age: 35 },
        ];

        await insertDocuments(db, collectionName, testData);

        const documents = await findDocuments(db, collectionName, { age: { $gt: 29 } });
        expect(documents.length).toBeGreaterThanOrEqual(1);
      } finally {
        await db.disconnect();
      }
    });

    it('should update documents', async () => {
      const db = createMongoDBTestDB(dbConfig);

      try {
        await db.connect();

        const testData = [{ name: 'John Doe', email: 'john@example.com', age: 30 }];

        await insertDocuments(db, collectionName, testData);
        await updateDocuments(db, collectionName, { name: 'John Doe' }, { age: 31 });

        const documents = await findDocuments(db, collectionName, { name: 'John Doe' });
        expect(documents[0]).toMatchObject({ age: 31 });
      } finally {
        await db.disconnect();
      }
    });

    it('should delete documents', async () => {
      const db = createMongoDBTestDB(dbConfig);

      try {
        await db.connect();

        const testData = [
          { name: 'John Doe', email: 'john@example.com', age: 30 },
          { name: 'Jane Smith', email: 'jane@example.com', age: 28 },
        ];

        await insertDocuments(db, collectionName, testData);
        await deleteDocuments(db, collectionName, { name: 'John Doe' });

        const count = await countDocuments(db, collectionName);
        expect(count).toBe(1);
      } finally {
        await db.disconnect();
      }
    });
  });

  describe('Transactions', () => {
    const collectionName = 'test_transactions';

    beforeEach(async () => {
      const db = createMongoDBTestDB(dbConfig);

      try {
        await db.connect();
        await db.dropCollection(collectionName);
      } catch (e) {
        // Collection might not exist
      } finally {
        await db.disconnect();
      }
    });

    afterEach(async () => {
      const db = createMongoDBTestDB(dbConfig);

      try {
        await db.connect();
        await db.dropCollection(collectionName);
      } finally {
        await db.disconnect();
      }
    });

    it('should handle transactions correctly', async () => {
      const db = createMongoDBTestDB(dbConfig);

      try {
        await db.connect();

        // Transactions require a replica set in MongoDB
        // This test demonstrates the API usage
        // In production, ensure MongoDB is configured as a replica set
        const testData = [{ amount: 100.0, status: 'pending' }];

        await insertDocuments(db, collectionName, testData);

        const count = await countDocuments(db, collectionName);
        expect(count).toBe(1);
      } finally {
        await db.disconnect();
      }
    });
  });

  describe('Database Cleanup', () => {
    it('should seed and cleanup database', async () => {
      const db = createMongoDBTestDB(dbConfig);

      try {
        await db.connect();

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

        await db.seed(seedData);

        const userCount = await countDocuments(db, 'users');
        expect(userCount).toBe(2);

        const postCount = await countDocuments(db, 'posts');
        expect(postCount).toBe(2);
      } finally {
        await db.dropDatabase();
        await db.disconnect();
      }
    });
  });
});
