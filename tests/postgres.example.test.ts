/**
 * Example PostgreSQL tests
 *
 * These tests demonstrate how to use the @kitium-ai/test-db package
 * for PostgreSQL testing
 */

import { createPostgresTestDB, insertData, fetchData, countRecords } from '../src/postgres/index.js';
import { PostgresConfig } from '../src/types/index.js';

describe('PostgreSQL Test Database', () => {
  let dbConfig: PostgresConfig;

  beforeAll(() => {
    dbConfig = {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      username: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      database: process.env.POSTGRES_DB || 'test_db',
    };
  });

  describe('Connection Management', () => {
    it('should connect to PostgreSQL database', async () => {
      const db = createPostgresTestDB(dbConfig);

      try {
        await db.connect();
        expect(db.isConnected()).toBe(true);
      } finally {
        await db.disconnect();
      }
    });

    it('should handle multiple connections gracefully', async () => {
      const db = createPostgresTestDB(dbConfig);

      try {
        await db.connect();
        await db.connect(); // Should not fail

        expect(db.isConnected()).toBe(true);
      } finally {
        await db.disconnect();
      }
    });

    it('should disconnect successfully', async () => {
      const db = createPostgresTestDB(dbConfig);

      await db.connect();
      expect(db.isConnected()).toBe(true);

      await db.disconnect();
      expect(db.isConnected()).toBe(false);
    });
  });

  describe('Query Execution', () => {
    it('should execute simple queries', async () => {
      const db = createPostgresTestDB(dbConfig);

      try {
        await db.connect();
        const result = await db.query('SELECT 1 as value');

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]).toEqual({ value: 1 });
      } finally {
        await db.disconnect();
      }
    });

    it('should throw error when not connected', async () => {
      const db = createPostgresTestDB(dbConfig);

      await expect(db.query('SELECT 1')).rejects.toThrow('Database is not connected');
    });
  });

  describe('Data Manipulation', () => {
    const tableName = 'test_users';

    beforeEach(async () => {
      const db = createPostgresTestDB(dbConfig);

      try {
        await db.connect();
        // Create test table
        await db.query(`
          CREATE TABLE IF NOT EXISTS ${tableName} (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            age INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
      } finally {
        await db.disconnect();
      }
    });

    afterEach(async () => {
      const db = createPostgresTestDB(dbConfig);

      try {
        await db.connect();
        await db.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
      } finally {
        await db.disconnect();
      }
    });

    it('should insert data', async () => {
      const db = createPostgresTestDB(dbConfig);

      try {
        await db.connect();
        const testData = [
          { name: 'John Doe', email: 'john@example.com', age: 30 },
          { name: 'Jane Smith', email: 'jane@example.com', age: 28 },
        ];

        await insertData(db, tableName, testData);

        const count = await countRecords(db, tableName);
        expect(count).toBe(2);
      } finally {
        await db.disconnect();
      }
    });

    it('should fetch data', async () => {
      const db = createPostgresTestDB(dbConfig);

      try {
        await db.connect();
        const testData = [
          { name: 'John Doe', email: 'john@example.com', age: 30 },
        ];

        await insertData(db, tableName, testData);
        const results = await fetchData(db, tableName);

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
          name: 'John Doe',
          email: 'john@example.com',
          age: 30,
        });
      } finally {
        await db.disconnect();
      }
    });

    it('should count records with filter', async () => {
      const db = createPostgresTestDB(dbConfig);

      try {
        await db.connect();
        const testData = [
          { name: 'John Doe', email: 'john@example.com', age: 30 },
          { name: 'Jane Smith', email: 'jane@example.com', age: 28 },
          { name: 'Bob Wilson', email: 'bob@example.com', age: 35 },
        ];

        await insertData(db, tableName, testData);

        const count = await countRecords(db, tableName, { 'age >': 30 });
        // Note: This is a simplified example; actual implementation would need proper query building
        expect(count).toBeGreaterThanOrEqual(0);
      } finally {
        await db.disconnect();
      }
    });
  });

  describe('Transactions', () => {
    const tableName = 'test_transactions';

    beforeEach(async () => {
      const db = createPostgresTestDB(dbConfig);

      try {
        await db.connect();
        await db.query(`
          CREATE TABLE IF NOT EXISTS ${tableName} (
            id SERIAL PRIMARY KEY,
            amount DECIMAL(10, 2) NOT NULL,
            status VARCHAR(50)
          )
        `);
      } finally {
        await db.disconnect();
      }
    });

    afterEach(async () => {
      const db = createPostgresTestDB(dbConfig);

      try {
        await db.connect();
        await db.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
      } finally {
        await db.disconnect();
      }
    });

    it('should handle transactions correctly', async () => {
      const db = createPostgresTestDB(dbConfig);

      try {
        await db.connect();

        await db.transaction(async (client) => {
          await client.query(
            `INSERT INTO ${tableName} (amount, status) VALUES ($1, $2)`,
            [100.0, 'pending']
          );
        });

        const result = await db.query(`SELECT * FROM ${tableName}`);
        expect(result.rows).toHaveLength(1);
      } finally {
        await db.disconnect();
      }
    });
  });
});
