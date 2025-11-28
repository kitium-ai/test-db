/**
 * @kitium-ai/test-db - MongoDB Test Client
 */

import { measure } from '@kitiumai/scripts/utils';
import { ClientSession, Db, MongoClient } from 'mongodb';

import { ConnectionState, IMongoDBTestDB, MongoDBConfig } from '../types/index.js';
import { sanitizeMongoDBConfig, validateMongoDBConfig } from '../utils/config.js';
import { createLogger, ILogger } from '../utils/logging.js';
import { withSpan } from '../utils/telemetry.js';

/**
 * MongoDB Test Database Client
 *
 * Provides connection management, transaction support, and utilities
 * for testing with MongoDB databases.
 */
export class MongoDBTestDB implements IMongoDBTestDB {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private state: ConnectionState = 'disconnected';
  private readonly config: MongoDBConfig;
  private readonly logger: ILogger;

  constructor(config: MongoDBConfig) {
    if (!validateMongoDBConfig(config)) {
      throw new Error('Invalid MongoDB configuration');
    }
    this.config = config;
    this.logger = createLogger('MongoDBTestDB');
    this.logger.info('MongoDB client initialized', sanitizeMongoDBConfig(config));
  }

  public getConfig(): MongoDBConfig {
    return { ...this.config };
  }

  /**
   * Connect to MongoDB database
   */
  public async connect(): Promise<void> {
    if (this.state !== 'disconnected') {
      this.logger.warn('Connection already in progress or established');
      return;
    }

    this.state = 'connecting';

    try {
      await measure('MongoDBTestDB.connect', async () =>
        withSpan('mongodb.connect', async () => {
          this.client = new MongoClient(this.config.uri, {
            connectTimeoutMS: this.config.connectionTimeout || 5000,
            serverSelectionTimeoutMS: this.config.serverSelectionTimeout || 5000,
            maxPoolSize: 20,
            minPoolSize: 5,
          });

          await this.client.connect();

          // Verify connection
          await this.client.db('admin').command({ ping: 1 });

          this.db = this.client.db(this.config.database);
        })
      );

      this.state = 'connected';
      this.logger.info('Connected to MongoDB database');
    } catch (error) {
      this.state = 'disconnected';
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to connect to MongoDB', undefined, error_);
      throw error_;
    }
  }

  /**
   * Disconnect from MongoDB database
   */
  public async disconnect(): Promise<void> {
    if (this.state === 'disconnected') {
      return;
    }

    this.state = 'disconnecting';

    try {
      await measure('MongoDBTestDB.disconnect', async () =>
        withSpan('mongodb.disconnect', async () => {
          if (this.client) {
            await this.client.close();
            this.client = null;
            this.db = null;
          }
        })
      );
      this.state = 'disconnected';
      this.logger.info('Disconnected from MongoDB database');
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Error disconnecting from MongoDB', undefined, error_);
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
   * Get a collection
   */
  public async collection(name: string): Promise<unknown> {
    if (!this.isConnected() || !this.db) {
      throw new Error('Database is not connected');
    }

    return this.db.collection(name);
  }

  /**
   * Execute a query (returns first document)
   */
  public async execute(query: string, _parameters?: unknown[]): Promise<unknown> {
    if (!this.isConnected() || !this.db) {
      throw new Error('Database is not connected');
    }

    try {
      // Parse simple query format for basic operations
      // For complex queries, use collection() method directly
      this.logger.debug('Executing query', { query });
      const result = await withSpan(
        'mongodb.query',
        () => this.db!.collection('_query').findOne({ query }),
        {
          query,
        }
      );
      return result ?? null;
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Query execution failed', { query }, error_);
      throw error_;
    }
  }

  /**
   * Execute a transaction
   */
  public async transaction(callback: (session: ClientSession) => Promise<void>): Promise<void> {
    if (!this.isConnected() || !this.client) {
      throw new Error('Database is not connected');
    }

    const session = this.client.startSession();

    try {
      await withSpan('mongodb.transaction', async () => {
        await session.withTransaction(async () => {
          this.logger.debug('Transaction started');
          await callback(session);
        });
        this.logger.debug('Transaction committed');
      });
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Transaction failed', undefined, error_);
      throw error_;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Drop a collection
   */
  public async dropCollection(name: string): Promise<void> {
    if (!this.isConnected() || !this.db) {
      throw new Error('Database is not connected');
    }

    try {
      await withSpan('mongodb.collection.drop', () => this.db!.collection(name).drop(), {
        collection: name,
      });
      this.logger.info('Dropped collection', { collection: name });
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      // Ignore "namespace not found" error
      if (!error_.message.includes('ns not found')) {
        this.logger.error('Failed to drop collection', { collection: name }, error_);
        throw error_;
      }
    }
  }

  /**
   * Drop database
   */
  public async dropDatabase(): Promise<void> {
    if (!this.isConnected() || !this.db) {
      throw new Error('Database is not connected');
    }

    try {
      await withSpan('mongodb.database.drop', () => this.db!.dropDatabase());
      this.logger.info('Dropped database');
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to drop database', undefined, error_);
      throw error_;
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
    if (!this.isConnected() || !this.db) {
      throw new Error('Database is not connected');
    }

    try {
      await withSpan('mongodb.seed', async () => {
        for (const [collectionName, documents] of Object.entries(data)) {
          if (!Array.isArray(documents)) {
            this.logger.warn('Invalid seed data for collection', { collection: collectionName });
            continue;
          }

          if (documents.length > 0 && this.db) {
            const collection = this.db.collection(collectionName);
            await collection.insertMany(documents as Record<string, unknown>[]);
          }
        }
      });

      this.logger.info('Database seeded successfully');
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to seed database', undefined, error_);
      throw error_;
    }
  }

  /**
   * Get database instance for direct access
   */
  public getDatabase(): Db {
    if (!this.isConnected() || !this.db) {
      throw new Error('Database is not connected');
    }
    return this.db;
  }
}

export type { IMongoDBTestDB, MongoDBConfig };
