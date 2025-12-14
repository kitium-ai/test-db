/**
 * Example PostgreSQL tests
 *
 * These tests demonstrate how to use the @kitium-ai/test-db package
 * for PostgreSQL testing
 */

import {
  countRecords,
  createPostgresTestDB,
  fetchData,
  insertData,
} from '../src/postgres/index.js';
import type { PostgresConfig } from '../src/types/index.js';

describe('PostgreSQL Test Database', () => {
  let databaseConfig: PostgresConfig;

  beforeAll(() => {
    databaseConfig = {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      username: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      database: process.env.POSTGRES_DB || 'test_db',
    };
  });

  describe('Connection Management', () => {
    it('should connect to PostgreSQL database', async () => {
      const database = createPostgresTestDB(databaseConfig);

      try {
        await database.connect();
        expect(database.isConnected()).toBe(true);
      } finally {
        await database.disconnect();
      }
    });

    it('should handle multiple connections gracefully', async () => {
      const database = createPostgresTestDB(databaseConfig);

      try {
        await database.connect();
        await database.connect(); // Should not fail

        expect(database.isConnected()).toBe(true);
      } finally {
        await database.disconnect();
      }
    });

    it('should disconnect successfully', async () => {
      const database = createPostgresTestDB(databaseConfig);

      await database.connect();
      expect(database.isConnected()).toBe(true);

      await database.disconnect();
      expect(database.isConnected()).toBe(false);
    });
  });

  describe('Query Execution', () => {
    it('should execute simple queries', async () => {
      const database = createPostgresTestDB(databaseConfig);

      try {
        await database.connect();
        const result = await database.query('SELECT 1 as value');

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]).toEqual({ value: 1 });
      } finally {
        await database.disconnect();
      }
    });

    it('should throw error when not connected', async () => {
      const database = createPostgresTestDB(databaseConfig);

      await expect(database.query('SELECT 1')).rejects.toThrow('Database is not connected');
    });
  });

  describe('Data Manipulation', () => {
    const tableName = 'test_users';

    beforeEach(async () => {
      const database = createPostgresTestDB(databaseConfig);

      try {
        await database.connect();
        // Create test table
        await database.query(`
          CREATE TABLE IF NOT EXISTS ${tableName} (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            age INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
      } finally {
        await database.disconnect();
      }
    });

    afterEach(async () => {
      const database = createPostgresTestDB(databaseConfig);

      try {
        await database.connect();
        await database.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
      } finally {
        await database.disconnect();
      }
    });

    it('should insert data', async () => {
      const database = createPostgresTestDB(databaseConfig);

      try {
        await database.connect();
        const testData = [
          { name: 'John Doe', email: 'john@example.com', age: 30 },
          { name: 'Jane Smith', email: 'jane@example.com', age: 28 },
        ];

        await insertData(database, tableName, testData);

        const count = await countRecords(database, tableName);
        expect(count).toBe(2);
      } finally {
        await database.disconnect();
      }
    });

    it('should fetch data', async () => {
      const database = createPostgresTestDB(databaseConfig);

      try {
        await database.connect();
        const testData = [{ name: 'John Doe', email: 'john@example.com', age: 30 }];

        await insertData(database, tableName, testData);
        const results = await fetchData(database, tableName);

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
          name: 'John Doe',
          email: 'john@example.com',
          age: 30,
        });
      } finally {
        await database.disconnect();
      }
    });

    it('should count records with filter', async () => {
      const database = createPostgresTestDB(databaseConfig);

      try {
        await database.connect();
        const testData = [
          { name: 'John Doe', email: 'john@example.com', age: 30 },
          { name: 'Jane Smith', email: 'jane@example.com', age: 28 },
          { name: 'Bob Wilson', email: 'bob@example.com', age: 35 },
        ];

        await insertData(database, tableName, testData);

        const count = await countRecords(database, tableName, { age: 30 });
        expect(count).toBeGreaterThanOrEqual(1);
      } finally {
        await database.disconnect();
      }
    });
  });

  describe('Transactions', () => {
    const tableName = 'test_transactions';

    beforeEach(async () => {
      const database = createPostgresTestDB(databaseConfig);

      try {
        await database.connect();
        await database.query(`
          CREATE TABLE IF NOT EXISTS ${tableName} (
            id SERIAL PRIMARY KEY,
            amount DECIMAL(10, 2) NOT NULL,
            status VARCHAR(50)
          )
        `);
      } finally {
        await database.disconnect();
      }
    });

    afterEach(async () => {
      const database = createPostgresTestDB(databaseConfig);

      try {
        await database.connect();
        await database.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
      } finally {
        await database.disconnect();
      }
    });

    it('should handle transactions correctly', async () => {
      const database = createPostgresTestDB(databaseConfig);

      try {
        await database.connect();

        await database.transaction(async (client) => {
          await client.query(`INSERT INTO ${tableName} (amount, status) VALUES ($1, $2)`, [
            100.0,
            'pending',
          ]);
        });

        const result = await database.query(`SELECT * FROM ${tableName}`);
        expect(result.rows).toHaveLength(1);
      } finally {
        await database.disconnect();
      }
    });
  });
});
