/**
 * @kitium-ai/test-db - PostgreSQL Helper functions
 */

import { PostgresTestDB } from './client.js';
import { PostgresConfig } from '../types/index.js';
import { getPostgresConfig } from '../utils/config.js';
import {
  buildDeleteStatement,
  buildInsertStatement,
  buildUpdateStatement,
  buildWhereClause,
} from './sql.js';

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
    const statement = buildInsertStatement(tableName, row);
    await database.query(statement.sql, statement.values);
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
  const whereClause = buildWhereClause(where, 1);
  const result = await database.query(
    `SELECT * FROM ${tableName}${whereClause.clause}`,
    whereClause.values
  );
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
  const whereClause = buildWhereClause(where, 1);
  const result = await database.query(
    `SELECT COUNT(*) as count FROM ${tableName}${whereClause.clause}`,
    whereClause.values
  );
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
  const statement = buildUpdateStatement(tableName, updates, where);
  await database.query(statement.sql, statement.values);
}

/**
 * Helper to delete data
 */
export async function deleteData(
  database: PostgresTestDB,
  tableName: string,
  where: Record<string, unknown>
): Promise<void> {
  const statement = buildDeleteStatement(tableName, where);
  await database.query(statement.sql, statement.values);
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
