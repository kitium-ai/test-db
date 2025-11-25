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
  db: PostgresTestDB,
  tableName: string,
  schema: string
): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS ${tableName} ${schema}`);
}

/**
 * Helper to drop table
 */
export async function dropTable(db: PostgresTestDB, tableName: string): Promise<void> {
  await db.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
}

/**
 * Helper to insert data
 */
export async function insertData(
  db: PostgresTestDB,
  tableName: string,
  data: Record<string, unknown>[]
): Promise<void> {
  for (const row of data) {
    const columns = Object.keys(row);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const values = columns.map((col) => row[col]);

    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    await db.query(sql, values);
  }
}

/**
 * Helper to fetch data
 */
export async function fetchData(
  db: PostgresTestDB,
  tableName: string,
  where?: Record<string, unknown>
): Promise<unknown[]> {
  let sql = `SELECT * FROM ${tableName}`;
  const values: unknown[] = [];

  if (where) {
    const conditions = Object.keys(where)
      .map((key, i) => {
        values.push(where[key]);
        return `${key} = $${i + 1}`;
      })
      .join(' AND ');
    sql += ` WHERE ${conditions}`;
  }

  const result = await db.query(sql, values);
  return result.rows;
}

/**
 * Helper to count records in table
 */
export async function countRecords(
  db: PostgresTestDB,
  tableName: string,
  where?: Record<string, unknown>
): Promise<number> {
  let sql = `SELECT COUNT(*) as count FROM ${tableName}`;
  const values: unknown[] = [];

  if (where) {
    const conditions = Object.keys(where)
      .map((key, i) => {
        values.push(where[key]);
        return `${key} = $${i + 1}`;
      })
      .join(' AND ');
    sql += ` WHERE ${conditions}`;
  }

  const result = await db.query(sql, values);
  return (result.rows[0] as { count: number }).count;
}

/**
 * Helper to update data
 */
export async function updateData(
  db: PostgresTestDB,
  tableName: string,
  updates: Record<string, unknown>,
  where: Record<string, unknown>
): Promise<void> {
  const updateColumns = Object.keys(updates)
    .map((key, i) => `${key} = $${i + 1}`)
    .join(', ');

  const whereConditions = Object.keys(where)
    .map((key, i) => `${key} = $${Object.keys(updates).length + i + 1}`)
    .join(' AND ');

  const values = [...Object.values(updates), ...Object.values(where)];

  const sql = `UPDATE ${tableName} SET ${updateColumns} WHERE ${whereConditions}`;
  await db.query(sql, values);
}

/**
 * Helper to delete data
 */
export async function deleteData(
  db: PostgresTestDB,
  tableName: string,
  where: Record<string, unknown>
): Promise<void> {
  const conditions = Object.keys(where)
    .map((key, i) => {
      return `${key} = $${i + 1}`;
    })
    .join(' AND ');

  const values = Object.values(where);
  const sql = `DELETE FROM ${tableName} WHERE ${conditions}`;
  await db.query(sql, values);
}

/**
 * Helper to reset auto-increment sequence
 */
export async function resetSequence(
  db: PostgresTestDB,
  tableName: string,
  columnName: string = 'id'
): Promise<void> {
  const sequenceName = `${tableName}_${columnName}_seq`;
  await db.query(`ALTER SEQUENCE "${sequenceName}" RESTART WITH 1`);
}

/**
 * Helper to setup test database with tables
 */
export async function setupTestDatabase(
  config: Partial<PostgresConfig>,
  schemas: Record<string, string>
): Promise<PostgresTestDB> {
  const db = createPostgresTestDB(config);
  await db.connect();

  try {
    for (const [tableName, schema] of Object.entries(schemas)) {
      await createTable(db, tableName, schema);
    }
  } catch (error) {
    await db.disconnect();
    throw error;
  }

  return db;
}

/**
 * Helper to teardown test database
 */
export async function teardownTestDatabase(db: PostgresTestDB, tables: string[]): Promise<void> {
  try {
    for (const table of tables) {
      await dropTable(db, table);
    }
  } finally {
    await db.disconnect();
  }
}
