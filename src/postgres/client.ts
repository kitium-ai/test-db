/**
 * @kitium-ai/test-db - PostgreSQL Test Client
 */

import { Pool, Client, PoolClient, QueryResult } from 'pg';
import { measure } from '@kitiumai/scripts/utils';
import { PostgresConfig, IPostgresTestDB, ConnectionState } from '../types/index.js';
import { createLogger, ILogger } from '../utils/logging.js';
import { validatePostgresConfig, sanitizePostgresConfig } from '../utils/config.js';
import { withSpan } from '../utils/telemetry.js';

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
      await measure('PostgresTestDB.connect', async () =>
        withSpan('postgres.connect', async () => {
          this.pool = new Pool({
            host: this.config.host,
            port: this.config.port,
            user: this.config.username,
            password: this.config.password,
            database: this.config.database,
            ssl: this.config.ssl,
            connectionTimeoutMillis: this.config.connectionTimeout || 5000,
            idleTimeoutMillis: this.config.idleTimeout || 30000,
            max: this.config.maxConnections || 20,
          });

          // Test the connection
          const client = await this.pool.connect();
          client.release();
        })
      );

      this.state = 'connected';
      this.logger.info('Connected to PostgreSQL database');
    } catch (error) {
      this.state = 'disconnected';
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to connect to PostgreSQL', undefined, err);
      throw err;
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
      await measure('PostgresTestDB.disconnect', async () =>
        withSpan('postgres.disconnect', async () => {
          if (this.pool) {
            await this.pool.end();
            this.pool = null;
          }
        })
      );
      this.state = 'disconnected';
      this.logger.info('Disconnected from PostgreSQL database');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Error disconnecting from PostgreSQL', undefined, err);
      throw err;
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
  public async query(sql: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.isConnected() || !this.pool) {
      throw new Error('Database is not connected');
    }

    try {
      this.logger.debug('Executing query', { sql, params: params?.length ?? 0 });
      const result = await withSpan('postgres.query', () => this.pool!.query(sql, params), { sql });
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Query execution failed', { sql }, err);
      throw err;
    }
  }

  /**
   * Borrow a raw client from the pool for advanced scenarios
   */
  public async leaseClient(): Promise<PoolClient> {
    if (!this.isConnected() || !this.pool) {
      throw new Error('Database is not connected');
    }
    return this.pool.connect();
  }

  /**
   * Execute query that returns first result
   */
  public async execute(sql: string, params?: unknown[]): Promise<unknown> {
    const result = await this.query(sql, params);
    return result.rows[0] ?? null;
  }

  /**
   * Execute a transaction
   */
  public async transaction(callback: (client: PoolClient) => Promise<void>): Promise<void> {
    if (!this.isConnected() || !this.pool) {
      throw new Error('Database is not connected');
    }

    const client = await this.pool.connect();

    try {
      await withSpan('postgres.transaction', async () => {
        await client.query('BEGIN');
        this.logger.debug('Transaction started');

        await callback(client);

        await client.query('COMMIT');
        this.logger.debug('Transaction committed');
      });
    } catch (error) {
      await client.query('ROLLBACK');
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Transaction rolled back', undefined, err);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a transaction that always rolls back (useful for per-test isolation)
   */
  public async transactionalTest(callback: (client: PoolClient) => Promise<void>): Promise<void> {
    if (!this.isConnected() || !this.pool) {
      throw new Error('Database is not connected');
    }

    const client = await this.pool.connect();
    try {
      await withSpan('postgres.transaction.rollback', async () => {
        await client.query('BEGIN');
        this.logger.debug('Transactional test started');
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
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to truncate tables', { tables }, err);
      throw err;
    }
  }

  /**
   * Create a new database
   */
  public async createDatabase(dbName: string): Promise<void> {
    const validDbName = /^[a-zA-Z0-9_-]+$/.test(dbName);
    if (!validDbName) {
      throw new Error('Invalid database name');
    }

    if (!this.pool) {
      throw new Error('Database is not connected');
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
        await client.query(`CREATE DATABASE "${dbName}"`);
      });
      this.logger.info('Created database', { database: dbName });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to create database', { database: dbName }, err);
      throw err;
    } finally {
      await client.end();
    }
  }

  /**
   * Drop a database
   */
  public async dropDatabase(dbName: string): Promise<void> {
    const validDbName = /^[a-zA-Z0-9_-]+$/.test(dbName);
    if (!validDbName) {
      throw new Error('Invalid database name');
    }

    if (!this.pool) {
      throw new Error('Database is not connected');
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
          [dbName]
        );
        // Drop the database
        await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      });
      this.logger.info('Dropped database', { database: dbName });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to drop database', { database: dbName }, err);
      throw err;
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
      throw new Error('Database is not connected');
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
            const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
            const values = columns.map((col) => (row as Record<string, unknown>)[col]);

            const sql = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
            await this.query(sql, values);
          }
        }
      });

      this.logger.info('Database seeded successfully');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to seed database', undefined, err);
      throw err;
    }
  }
}

export type { PostgresConfig, IPostgresTestDB };
