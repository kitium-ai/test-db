/**
 * @kitium-ai/test-db - PostgreSQL Test Client
 */

import { Client, Pool, type PoolClient, type QueryResult } from 'pg';

import type { ConnectionState, IPostgresTestDB, PostgresConfig } from '../types/index.js';
import { sanitizePostgresConfig, validatePostgresConfig } from '../utils/config.js';
import { addErrorToMeta } from '../utils/errors.js';
import { instrument } from '../utils/instrument.js';
import { createLogger, type ILogger } from '../utils/logging.js';
import { withSpan } from '../utils/telemetry.js';

const databaseNotConnectedError = 'Database is not connected';

/**
 * PostgreSQL Test Database Client
 *
 * Provides connection pooling, transaction management, and utilities
 * for testing with PostgreSQL databases.
 */
export class PostgresTestDB implements IPostgresTestDB {
  private pool: Pool | null = null;
  private state: ConnectionState = 'disconnected';
  private readonly config: PostgresConfig;
  private readonly logger: ILogger;

  constructor(config: PostgresConfig) {
    if (!validatePostgresConfig(config)) {
      throw new Error('Invalid PostgreSQL configuration');
    }
    this.config = config;
    this.logger = createLogger('PostgresTestDB');
    this.logger.info('PostgreSQL client initialized', sanitizePostgresConfig(config));
  }

  public getConfig(): PostgresConfig {
    return { ...this.config };
  }

  /**
   * Connect to PostgreSQL database
   */
  public async connect(): Promise<void> {
    if (this.state !== 'disconnected') {
      this.logger.warn('Connection already in progress or established');
      return;
    }

    this.state = 'connecting';

    try {
      await instrument('PostgresTestDB.connect', 'postgres.connect', async () => {
        this.pool = new Pool({
          host: this.config.host,
          port: this.config.port,
          user: this.config.username,
          password: this.config.password,
          database: this.config.database,
          ssl: this.config.ssl,
          connectionTimeoutMillis: this.config.connectionTimeout ?? 5000,
          idleTimeoutMillis: this.config.idleTimeout ?? 30000,
          max: this.config.maxConnections ?? 20,
        });

        // Test the connection
        const client = await this.pool.connect();
        client.release();
      });

      this.state = 'connected';
      this.logger.info('Connected to PostgreSQL database');
    } catch (error) {
      this.state = 'disconnected';
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to connect to PostgreSQL', addErrorToMeta(undefined, error_));
      throw error_;
    }
  }

  /**
   * Disconnect from PostgreSQL database
   */
  public async disconnect(): Promise<void> {
    if (this.state === 'disconnected') {
      return;
    }

    this.state = 'disconnecting';

    try {
      await instrument('PostgresTestDB.disconnect', 'postgres.disconnect', async () => {
        if (this.pool) {
          await this.pool.end();
          this.pool = null;
        }
      });
      this.state = 'disconnected';
      this.logger.info('Disconnected from PostgreSQL database');
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Error disconnecting from PostgreSQL', addErrorToMeta(undefined, error_));
      throw error_;
    }
  }

  /**
   * Check if connected to database
   */
  public isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Execute a query
   */
  public async query(sql: string, parameters?: unknown[]): Promise<QueryResult> {
    if (!this.isConnected() || !this.pool) {
      throw new Error(databaseNotConnectedError);
    }

    const pool = this.pool;
    try {
      this.logger.debug('Executing query', { sql, params: parameters?.length ?? 0 });
      const result = await withSpan('postgres.query', () => pool.query(sql, parameters), {
        sql,
      });
      return result;
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Query execution failed', addErrorToMeta({ sql }, error_));
      throw error_;
    }
  }

  /**
   * Borrow a raw client from the pool for advanced scenarios
   */
  public leaseClient(): Promise<PoolClient> {
    if (!this.isConnected() || !this.pool) {
      throw new Error(databaseNotConnectedError);
    }
    return this.pool.connect();
  }

  /**
   * Execute query that returns first result
   */
  public async execute(sql: string, parameters?: unknown[]): Promise<unknown> {
    const result = await this.query(sql, parameters);
    return result.rows[0] ?? null;
  }

  /**
   * Execute a transaction
   */
  // eslint-disable-next-line promise/prefer-await-to-callbacks
  public async transaction(callback: (client: PoolClient) => Promise<void>): Promise<void> {
    if (!this.isConnected() || !this.pool) {
      throw new Error(databaseNotConnectedError);
    }

    const client = await this.pool.connect();

    try {
      await withSpan('postgres.transaction', async () => {
        await client.query('BEGIN');
        this.logger.debug('Transaction started');

        // eslint-disable-next-line promise/prefer-await-to-callbacks
        await callback(client);

        await client.query('COMMIT');
        this.logger.debug('Transaction committed');
      });
    } catch (error) {
      await client.query('ROLLBACK');
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Transaction rolled back', addErrorToMeta(undefined, error_));
      throw error_;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a transaction that always rolls back (useful for per-test isolation)
   */
  // eslint-disable-next-line promise/prefer-await-to-callbacks
  public async transactionalTest(callback: (client: PoolClient) => Promise<void>): Promise<void> {
    if (!this.isConnected() || !this.pool) {
      throw new Error(databaseNotConnectedError);
    }

    const client = await this.pool.connect();
    try {
      await withSpan('postgres.transaction.rollback', async () => {
        await client.query('BEGIN');
        this.logger.debug('Transactional test started');
        // eslint-disable-next-line promise/prefer-await-to-callbacks
        await callback(client);
        await client.query('ROLLBACK');
        this.logger.debug('Transactional test rolled back');
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error instanceof Error ? error : new Error(String(error));
    } finally {
      client.release();
    }
  }

  /**
   * Truncate tables
   */
  public async truncateTables(tables: string[]): Promise<void> {
    if (tables.length === 0) {
      return;
    }

    const quotedTables = tables.map((t) => `"${t}"`).join(', ');
    const sql = `TRUNCATE TABLE ${quotedTables} CASCADE`;

    try {
      await withSpan('postgres.truncate', () => this.query(sql), { tables });
      this.logger.info('Truncated tables', { tables });
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to truncate tables', addErrorToMeta({ tables }, error_));
      throw error_;
    }
  }

  /**
   * Create a new database
   */
  public async createDatabase(databaseName: string): Promise<void> {
    const isValidDatabaseName = /^[a-zA-Z0-9_-]+$/.test(databaseName);
    if (!isValidDatabaseName) {
      throw new Error('Invalid database name');
    }

    if (!this.pool) {
      throw new Error(databaseNotConnectedError);
    }

    // Use a temporary client to create the database
    const client = new Client({
      host: this.config.host,
      port: this.config.port,
      user: this.config.username,
      password: this.config.password,
      database: 'postgres', // Connect to default postgres database
    });

    try {
      await withSpan('postgres.database.create', async () => {
        await client.connect();
        await client.query(`CREATE DATABASE "${databaseName}"`);
      });
      this.logger.info('Created database', { database: databaseName });
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Failed to create database',
        addErrorToMeta({ database: databaseName }, error_)
      );
      throw error_;
    } finally {
      await client.end();
    }
  }

  /**
   * Drop a database
   */
  public async dropDatabase(databaseName: string): Promise<void> {
    const isValidDatabaseName = /^[a-zA-Z0-9_-]+$/.test(databaseName);
    if (!isValidDatabaseName) {
      throw new Error('Invalid database name');
    }

    if (!this.pool) {
      throw new Error(databaseNotConnectedError);
    }

    // Use a temporary client to drop the database
    const client = new Client({
      host: this.config.host,
      port: this.config.port,
      user: this.config.username,
      password: this.config.password,
      database: 'postgres', // Connect to default postgres database
    });

    try {
      await withSpan('postgres.database.drop', async () => {
        await client.connect();
        // Terminate connections to the database
        await client.query(
          `
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid()
      `,
          [databaseName]
        );
        // Drop the database
        await client.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      });
      this.logger.info('Dropped database', { database: databaseName });
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        'Failed to drop database',
        addErrorToMeta({ database: databaseName }, error_)
      );
      throw error_;
    } finally {
      await client.end();
    }
  }

  /**
   * Cleanup: close all connections
   */
  public async cleanup(): Promise<void> {
    await this.disconnect();
  }

  /**
   * Seed database with data
   */
  public async seed(data: Record<string, unknown>): Promise<void> {
    if (!this.isConnected()) {
      throw new Error(databaseNotConnectedError);
    }

    try {
      await withSpan('postgres.seed', async () => {
        for (const [table, rows] of Object.entries(data)) {
          if (!Array.isArray(rows)) {
            this.logger.warn('Invalid seed data for table', { table });
            continue;
          }

          for (const row of rows) {
            const columns = Object.keys(row as Record<string, unknown>);
            const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
            const values = columns.map((col) => (row as Record<string, unknown>)[col]);

            const columnList = columns.map((column) => `"${column}"`).join(', ');
            const sql = `INSERT INTO "${table}" (${columnList}) VALUES (${placeholders})`;
            await this.query(sql, values);
          }
        }
      });

      this.logger.info('Database seeded successfully');
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to seed database', addErrorToMeta(undefined, error_));
      throw error_;
    }
  }
}

export type { IPostgresTestDB, PostgresConfig };
