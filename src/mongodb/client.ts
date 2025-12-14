/**
 * @kitium-ai/test-db - MongoDB Test Client
 */

import { type ClientSession, type Db, MongoClient } from 'mongodb';

import type { ConnectionState, IMongoDBTestDB, MongoDBConfig } from '../types/index.js';
import { sanitizeMongoDBConfig, validateMongoDBConfig } from '../utils/config.js';
import { addErrorToMeta } from '../utils/errors.js';
import { instrument } from '../utils/instrument.js';
import { createLogger, type ILogger } from '../utils/logging.js';
import { withSpan } from '../utils/telemetry.js';

const databaseNotConnectedError = 'Database is not connected';

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
      await instrument('MongoDBTestDB.connect', 'mongodb.connect', async () => {
        this.client = new MongoClient(this.config.uri, {
          connectTimeoutMS: this.config.connectionTimeout ?? 5000,
          serverSelectionTimeoutMS: this.config.serverSelectionTimeout ?? 5000,
          maxPoolSize: 20,
          minPoolSize: 5,
        });

        await this.client.connect();

        // Verify connection
        await this.client.db('admin').command({ ping: 1 });

        this.db = this.client.db(this.config.database);
      });

      this.state = 'connected';
      this.logger.info('Connected to MongoDB database');
    } catch (error) {
      this.state = 'disconnected';
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to connect to MongoDB', addErrorToMeta(undefined, error_));
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
      await instrument('MongoDBTestDB.disconnect', 'mongodb.disconnect', async () => {
        if (this.client) {
          await this.client.close();
          this.client = null;
          this.db = null;
        }
      });
      this.state = 'disconnected';
      this.logger.info('Disconnected from MongoDB database');
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Error disconnecting from MongoDB', addErrorToMeta(undefined, error_));
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
  public collection(name: string): Promise<unknown> {
    if (!this.isConnected() || !this.db) {
      throw new Error(databaseNotConnectedError);
    }

    return Promise.resolve(this.db.collection(name));
  }

  /**
   * Execute a query (returns first document)
   */
  public async execute(query: string, _parameters?: unknown[]): Promise<unknown> {
    if (!this.isConnected() || !this.db) {
      throw new Error(databaseNotConnectedError);
    }

    const database = this.db;
    try {
      // Parse simple query format for basic operations
      // For complex queries, use collection() method directly
      this.logger.debug('Executing query', { query });
      const result = await withSpan(
        'mongodb.query',
        () => database.collection('_query').findOne({ query }),
        {
          query,
        }
      );
      return result ?? null;
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Query execution failed', addErrorToMeta({ query }, error_));
      throw error_;
    }
  }

  /**
   * Execute a transaction
   */
  /* eslint-disable promise/prefer-await-to-callbacks */
  public async transaction(callback: (session: ClientSession) => Promise<void>): Promise<void> {
    if (!this.isConnected() || !this.client) {
      throw new Error(databaseNotConnectedError);
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
      this.logger.error('Transaction failed', addErrorToMeta(undefined, error_));
      throw error_;
    } finally {
      await session.endSession();
    }
  }
  /* eslint-enable promise/prefer-await-to-callbacks */

  /**
   * Drop a collection
   */
  public async dropCollection(name: string): Promise<void> {
    if (!this.isConnected() || !this.db) {
      throw new Error(databaseNotConnectedError);
    }

    const database = this.db;
    try {
      await withSpan('mongodb.collection.drop', () => database.collection(name).drop(), {
        collection: name,
      });
      this.logger.info('Dropped collection', { collection: name });
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      // Ignore "namespace not found" error
      if (!error_.message.includes('ns not found')) {
        this.logger.error(
          'Failed to drop collection',
          addErrorToMeta({ collection: name }, error_)
        );
        throw error_;
      }
    }
  }

  /**
   * Drop database
   */
  public async dropDatabase(): Promise<void> {
    if (!this.isConnected() || !this.db) {
      throw new Error(databaseNotConnectedError);
    }

    const database = this.db;
    try {
      await withSpan('mongodb.database.drop', () => database.dropDatabase());
      this.logger.info('Dropped database');
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to drop database', addErrorToMeta(undefined, error_));
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
      throw new Error(databaseNotConnectedError);
    }

    const database = this.db;
    try {
      await withSpan('mongodb.seed', async () => {
        for (const [collectionName, documents] of Object.entries(data)) {
          if (!Array.isArray(documents)) {
            this.logger.warn('Invalid seed data for collection', { collection: collectionName });
            continue;
          }

          if (documents.length > 0) {
            const collection = database.collection(collectionName);
            await collection.insertMany(documents as Array<Record<string, unknown>>);
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

  /**
   * Get database instance for direct access
   */
  public getDatabase(): Db {
    if (!this.isConnected() || !this.db) {
      throw new Error(databaseNotConnectedError);
    }
    return this.db;
  }
}

export type { IMongoDBTestDB, MongoDBConfig };
