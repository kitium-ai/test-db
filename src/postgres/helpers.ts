/**
 * @kitium-ai/test-db - PostgreSQL Helper functions
 */

import { PostgresTestDB } from './client.js';
import { PostgresConfig } from '../types/index.js';
import { getPostgresConfig } from '../utils/config.js';

/**
 * Create a PostgreSQL test database instance
 */
export function createPostgresTestDB(config?: Partial<PostgresConfig>): PostgresTestDB {
  const fullConfig = getPostgresConfig(config);
  return new PostgresTestDB(fullConfig);
}

/**
 * Helper to create table
 */
export async function createTable(
  database: PostgresTestDB,
  tableName: string,
  schema: string
): Promise<void> {
  await database.query(`CREATE TABLE IF NOT EXISTS ${tableName} ${schema}`);
}

/**
 * Helper to drop table
 */
export async function dropTable(database: PostgresTestDB, tableName: string): Promise<void> {
  await database.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
}

/**
 * Helper to insert data
 */
export async function insertData(
  database: PostgresTestDB,
  tableName: string,
  data: Record<string, unknown>[]
): Promise<void> {
  for (const row of data) {
    const columns = Object.keys(row);
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    const values = columns.map((col) => row[col]);

    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    await database.query(sql, values);
  }
}

/**
 * Helper to fetch data
 */
export async function fetchData(
  database: PostgresTestDB,
  tableName: string,
  where?: Record<string, unknown>
): Promise<unknown[]> {
  let sql = `SELECT * FROM ${tableName}`;
  const values: unknown[] = [];

  if (where) {
    const conditions = Object.keys(where)
      .map((key, index) => {
        values.push(where[key]);
        return `${key} = $${index + 1}`;
      })
      .join(' AND ');
    sql += ` WHERE ${conditions}`;
  }

  const result = await database.query(sql, values);
  return result.rows;
}

/**
 * Helper to count records in table
 */
export async function countRecords(
  database: PostgresTestDB,
  tableName: string,
  where?: Record<string, unknown>
): Promise<number> {
  let sql = `SELECT COUNT(*) as count FROM ${tableName}`;
  const values: unknown[] = [];

  if (where) {
    const conditions = Object.keys(where)
      .map((key, index) => {
        values.push(where[key]);
        return `${key} = $${index + 1}`;
      })
      .join(' AND ');
    sql += ` WHERE ${conditions}`;
  }

  const result = await database.query(sql, values);
  return (result.rows[0] as { count: number }).count;
}

/**
 * Helper to update data
 */
export async function updateData(
  database: PostgresTestDB,
  tableName: string,
  updates: Record<string, unknown>,
  where: Record<string, unknown>
): Promise<void> {
  const updateColumns = Object.keys(updates)
    .map((key, index) => `${key} = $${index + 1}`)
    .join(', ');

  const whereConditions = Object.keys(where)
    .map((key, index) => `${key} = $${Object.keys(updates).length + index + 1}`)
    .join(' AND ');

  const values = [...Object.values(updates), ...Object.values(where)];

  const sql = `UPDATE ${tableName} SET ${updateColumns} WHERE ${whereConditions}`;
  await database.query(sql, values);
}

/**
 * Helper to delete data
 */
export async function deleteData(
  database: PostgresTestDB,
  tableName: string,
  where: Record<string, unknown>
): Promise<void> {
  const conditions = Object.keys(where)
    .map((key, index) => {
      return `${key} = $${index + 1}`;
    })
    .join(' AND ');

  const values = Object.values(where);
  const sql = `DELETE FROM ${tableName} WHERE ${conditions}`;
  await database.query(sql, values);
}

/**
 * Helper to reset auto-increment sequence
 */
export async function resetSequence(
  database: PostgresTestDB,
  tableName: string,
  columnName: string = 'id'
): Promise<void> {
  const sequenceName = `${tableName}_${columnName}_seq`;
  await database.query(`ALTER SEQUENCE "${sequenceName}" RESTART WITH 1`);
}

/**
 * Helper to setup test database with tables
 */
export async function setupTestDatabase(
  config: Partial<PostgresConfig>,
  schemas: Record<string, string>
): Promise<PostgresTestDB> {
  const database = createPostgresTestDB(config);
  await database.connect();

  try {
    for (const [tableName, schema] of Object.entries(schemas)) {
      await createTable(database, tableName, schema);
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
  database: PostgresTestDB,
  tables: string[]
): Promise<void> {
  try {
    for (const table of tables) {
      await dropTable(database, table);
    }
  } finally {
    await database.disconnect();
  }
}
