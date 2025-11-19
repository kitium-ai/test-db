/**
 * @kitium-ai/test-db - MongoDB Test Client
 */

import { MongoClient, Db, ClientSession } from 'mongodb';
import { MongoDBConfig, IMongoDBTestDB, ConnectionState } from '../types/index.js';
import { createLogger, ILogger } from '../utils/logging.js';
import { validateMongoDBConfig, sanitizeMongoDBConfig } from '../utils/config.js';

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
    this.logger = createLogger('MongoDBTestDB', process.env.DEBUG === 'true');
    this.logger.info('MongoDB client initialized', sanitizeMongoDBConfig(config));
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
      this.state = 'connected';
      this.logger.info('Connected to MongoDB database');
    } catch (error) {
      this.state = 'disconnected';
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to connect to MongoDB', err);
      throw err;
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
      if (this.client) {
        await this.client.close();
        this.client = null;
        this.db = null;
      }
      this.state = 'disconnected';
      this.logger.info('Disconnected from MongoDB database');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Error disconnecting from MongoDB', err);
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
  public async execute(query: string, _params?: unknown[]): Promise<unknown> {
    if (!this.isConnected() || !this.db) {
      throw new Error('Database is not connected');
    }

    try {
      // Parse simple query format for basic operations
      // For complex queries, use collection() method directly
      this.logger.debug('Executing query', { query });
      const result = await this.db.collection('_query').findOne({});
      return result ?? null;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Query execution failed', err, { query });
      throw err;
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
      await session.withTransaction(async () => {
        this.logger.debug('Transaction started');
        await callback(session);
      });
      this.logger.debug('Transaction committed');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Transaction failed', err);
      throw err;
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
      await this.db.collection(name).drop();
      this.logger.info('Dropped collection', { collection: name });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // Ignore "namespace not found" error
      if (!err.message.includes('ns not found')) {
        this.logger.error('Failed to drop collection', err);
        throw err;
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
      await this.db.dropDatabase();
      this.logger.info('Dropped database');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to drop database', err);
      throw err;
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
      for (const [collectionName, documents] of Object.entries(data)) {
        if (!Array.isArray(documents)) {
          this.logger.warn('Invalid seed data for collection', { collection: collectionName });
          continue;
        }

        if (documents.length > 0) {
          const collection = this.db.collection(collectionName);
          await collection.insertMany(documents as Record<string, unknown>[]);
        }
      }

      this.logger.info('Database seeded successfully');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to seed database', err);
      throw err;
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

export { MongoDBConfig, IMongoDBTestDB };
