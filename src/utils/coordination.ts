/**
 * Multi-database transaction coordination utilities
 */

import { randomUUID } from 'node:crypto';

import { MongoDBTestDB } from '../mongodb/client.js';
import { PostgresTestDB } from '../postgres/client.js';
import { createLogger, type ILogger } from './logging.js';
import { withSpan } from './telemetry.js';

export type DatabaseOperation = {
  database: PostgresTestDB | MongoDBTestDB;
  operation: (client: unknown) => Promise<void>;
  description?: string;
};

export type TransactionConfig = {
  isolation: 'read_uncommitted' | 'read_committed' | 'repeatable_read' | 'serializable';
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
};

export type CoordinationResult = {
  success: boolean;
  transactionId: string;
  duration: number;
  committed: string[];
  rolledBack: string[];
  errors: Array<{ database: string; error: string }>;
};

type PreparedTransaction = {
  database: PostgresTestDB | MongoDBTestDB;
  client: unknown;
  operation: DatabaseOperation;
};

export class MultiDatabaseCoordinator {
  private readonly logger: ILogger;
  private readonly activeTransactions: Map<string, { databases: string[]; startTime: number }> =
    new Map();

  constructor() {
    this.logger = createLogger('MultiDatabaseCoordinator');
  }

  /**
   * Execute operations across multiple databases in a coordinated transaction
   */
  public async executeCoordinatedTransaction(
    operations: DatabaseOperation[],
    config: TransactionConfig = { isolation: 'read_committed' }
  ): Promise<CoordinationResult> {
    const transactionId = randomUUID();
    const startTime = Date.now();

    const result = this.createInitialResult(transactionId);

    try {
      await withSpan('multi-db.transaction.coordinated', () =>
        this.runCoordinatedTransaction(operations, config, transactionId, startTime, result)
      );

      result.duration = Date.now() - startTime;
      this.logger.info('Coordinated transaction completed', {
        transactionId,
        success: result.success,
        duration: result.duration,
        committed: result.committed.length,
        rolledBack: result.rolledBack.length,
      });
    } catch (error) {
      result.success = false;
      const error_ = error instanceof Error ? error : new Error(String(error));
      result.errors.push({ database: 'coordinator', error: error_.message });
      this.logger.error('Coordinated transaction failed', { transactionId, error: error_.message });
    } finally {
      this.activeTransactions.delete(transactionId);
    }

    return result;
  }

  private createInitialResult(transactionId: string): CoordinationResult {
    return {
      success: true,
      transactionId,
      duration: 0,
      committed: [],
      rolledBack: [],
      errors: [],
    };
  }

  private async runCoordinatedTransaction(
    operations: DatabaseOperation[],
    config: TransactionConfig,
    transactionId: string,
    startTime: number,
    result: CoordinationResult
  ): Promise<void> {
    this.logger.info('Starting coordinated transaction', {
      transactionId,
      operationCount: operations.length,
    });

    this.activeTransactions.set(transactionId, {
      databases: operations.map((operation) => this.getDatabaseId(operation.database)),
      startTime,
    });

    const preparedTransactions = await this.prepareCoordinatedTransactions(
      operations,
      config,
      result
    );
    await this.executePreparedTransactions(preparedTransactions, result);
    await this.finalizePreparedTransactions(preparedTransactions, result);
  }

  private async prepareCoordinatedTransactions(
    operations: DatabaseOperation[],
    config: TransactionConfig,
    result: CoordinationResult
  ): Promise<PreparedTransaction[]> {
    const preparedTransactions: PreparedTransaction[] = [];

    for (const operation of operations) {
      try {
        const client = await this.beginTransaction(operation.database, config);
        preparedTransactions.push({ database: operation.database, client, operation });
      } catch (error) {
        const error_ = error instanceof Error ? error : new Error(String(error));
        result.errors.push({
          database: this.getDatabaseId(operation.database),
          error: error_.message,
        });
        result.success = false;
      }
    }

    return preparedTransactions;
  }

  private async executePreparedTransactions(
    preparedTransactions: PreparedTransaction[],
    result: CoordinationResult
  ): Promise<void> {
    if (!result.success) {
      return;
    }

    for (const { client, operation } of preparedTransactions) {
      try {
        await operation.operation(client);
        result.committed.push(this.getDatabaseId(operation.database));
      } catch (error) {
        const error_ = error instanceof Error ? error : new Error(String(error));
        result.errors.push({
          database: this.getDatabaseId(operation.database),
          error: error_.message,
        });
        result.success = false;
        return;
      }
    }
  }

  private async finalizePreparedTransactions(
    preparedTransactions: PreparedTransaction[],
    result: CoordinationResult
  ): Promise<void> {
    if (result.success) {
      await this.commitAll(preparedTransactions, result);
      return;
    }

    await this.rollbackAll(preparedTransactions, result);
  }

  /**
   * Execute saga pattern for long-running multi-database operations
   */
  public async executeSagaTransaction(
    operations: DatabaseOperation[],
    compensations: Array<(database: PostgresTestDB | MongoDBTestDB) => Promise<void>>
  ): Promise<CoordinationResult> {
    const transactionId = randomUUID();
    const startTime = Date.now();

    const result = this.createInitialResult(transactionId);

    try {
      await withSpan('multi-db.transaction.saga', () =>
        this.runSagaTransaction(operations, compensations, transactionId, result)
      );

      result.duration = Date.now() - startTime;
      this.logger.info('Saga transaction completed', {
        transactionId,
        success: result.success,
        duration: result.duration,
      });
    } catch (error) {
      result.success = false;
      const error_ = error instanceof Error ? error : new Error(String(error));
      result.errors.push({ database: 'saga', error: error_.message });
      this.logger.error('Saga transaction failed', { transactionId, error: error_.message });
    }

    return result;
  }

  private async runSagaTransaction(
    operations: DatabaseOperation[],
    compensations: Array<(database: PostgresTestDB | MongoDBTestDB) => Promise<void>>,
    transactionId: string,
    result: CoordinationResult
  ): Promise<void> {
    this.logger.info('Starting saga transaction', {
      transactionId,
      operationCount: operations.length,
    });

    const completedOperations: DatabaseOperation[] = [];
    await this.executeSagaOperations(operations, compensations, completedOperations, result);
  }

  private async executeSagaOperations(
    operations: DatabaseOperation[],
    compensations: Array<(database: PostgresTestDB | MongoDBTestDB) => Promise<void>>,
    completedOperations: DatabaseOperation[],
    result: CoordinationResult
  ): Promise<void> {
    for (const operation of operations) {
      try {
        await operation.operation(operation.database);
        result.committed.push(this.getDatabaseId(operation.database));
        completedOperations.push(operation);
      } catch (error) {
        const error_ = error instanceof Error ? error : new Error(String(error));
        result.errors.push({
          database: this.getDatabaseId(operation.database),
          error: error_.message,
        });
        result.success = false;
        await this.executeCompensations(completedOperations, compensations, result);
        return;
      }
    }
  }

  /**
   * Execute operations with eventual consistency (BASE transactions)
   */
  public async executeEventuallyConsistent(
    operations: DatabaseOperation[],
    consistencyTimeout = 30000
  ): Promise<CoordinationResult> {
    const transactionId = randomUUID();
    const startTime = Date.now();

    const result = this.createInitialResult(transactionId);

    try {
      await withSpan('multi-db.transaction.eventual', () =>
        this.runEventuallyConsistentTransaction(
          operations,
          consistencyTimeout,
          transactionId,
          result
        )
      );

      result.duration = Date.now() - startTime;
      this.logger.info('Eventual consistency transaction completed', {
        transactionId,
        success: result.success,
        duration: result.duration,
      });
    } catch (error) {
      result.success = false;
      const error_ = error instanceof Error ? error : new Error(String(error));
      result.errors.push({ database: 'eventual', error: error_.message });
      this.logger.error('Eventual consistency transaction failed', {
        transactionId,
        error: error_.message,
      });
    }

    return result;
  }

  private async runEventuallyConsistentTransaction(
    operations: DatabaseOperation[],
    consistencyTimeout: number,
    transactionId: string,
    result: CoordinationResult
  ): Promise<void> {
    this.logger.info('Starting eventual consistency transaction', { transactionId });
    const operationPromise = this.runEventuallyConsistentOperations(operations, result);
    await this.waitForConsistency(operationPromise, consistencyTimeout);
  }

  private async runEventuallyConsistentOperations(
    operations: DatabaseOperation[],
    result: CoordinationResult
  ): Promise<void> {
    const results = await Promise.allSettled(
      operations.map(async (operation) => {
        await operation.operation(operation.database);
        return this.getDatabaseId(operation.database);
      })
    );

    for (const result_ of results) {
      if (result_.status === 'fulfilled') {
        result.committed.push(result_.value);
        continue;
      }

      const error =
        result_.reason instanceof Error ? result_.reason : new Error(String(result_.reason));
      result.errors.push({ database: 'eventual', error: error.message });
      result.success = false;
    }
  }

  private async waitForConsistency(
    operationPromise: Promise<void>,
    timeout: number
  ): Promise<void> {
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(resolve, timeout);
    });

    await Promise.race([operationPromise, timeoutPromise]);
  }

  /**
   * Check consistency across databases
   */
  public async checkConsistency(
    databases: Array<PostgresTestDB | MongoDBTestDB>,
    consistencyCheck: (databases: Array<PostgresTestDB | MongoDBTestDB>) => Promise<boolean>
  ): Promise<{
    isConsistent: boolean;
    checkDuration: number;
    details: Record<string, unknown>;
  }> {
    const startTime = Date.now();

    try {
      const isConsistent = await consistencyCheck(databases);
      const checkDuration = Date.now() - startTime;

      return {
        isConsistent,
        checkDuration,
        details: { databases: databases.length },
      };
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Consistency check failed', { error: error_.message });

      return {
        isConsistent: false,
        checkDuration: Date.now() - startTime,
        details: { error: error_.message },
      };
    }
  }

  /**
   * Get active transaction status
   */
  public getActiveTransactions(): Array<{ id: string; databases: string[]; duration: number }> {
    const now = Date.now();
    return Array.from(this.activeTransactions.entries()).map(([id, info]) => ({
      id,
      databases: info.databases,
      duration: now - info.startTime,
    }));
  }

  private async beginTransaction(
    database: PostgresTestDB | MongoDBTestDB,
    config: TransactionConfig
  ): Promise<unknown> {
    if (database instanceof PostgresTestDB) {
      const client = await database.leaseClient();
      await client.query('BEGIN');

      if (config.isolation !== 'read_committed') {
        await client.query(`SET TRANSACTION ISOLATION LEVEL ${config.isolation.replace('_', ' ')}`);
      }

      if (config.timeout) {
        await client.query(`SET LOCAL statement_timeout = ${config.timeout}`);
      }

      return client;
    } else if (database instanceof MongoDBTestDB) {
      // MongoDB transactions are handled differently
      return database;
    }

    throw new Error('Unsupported database type');
  }

  private async commitAll(
    transactions: Array<{ database: PostgresTestDB | MongoDBTestDB; client: unknown }>,
    result: CoordinationResult
  ): Promise<void> {
    for (const { database, client } of transactions) {
      try {
        if (database instanceof PostgresTestDB) {
          // Client is a PostgreSQL client with query and release methods
          await (client as { query: (sql: string) => Promise<unknown>; release: () => void }).query(
            'COMMIT'
          );
          (client as { query: (sql: string) => Promise<unknown>; release: () => void }).release();
        }
        // MongoDB commits are handled in the transaction
      } catch (error) {
        const error_ = error instanceof Error ? error : new Error(String(error));
        result.errors.push({
          database: this.getDatabaseId(database),
          error: `Commit failed: ${error_.message}`,
        });
        result.success = false;
      }
    }
  }

  private async rollbackAll(
    transactions: Array<{ database: PostgresTestDB | MongoDBTestDB; client: unknown }>,
    result: CoordinationResult
  ): Promise<void> {
    for (const { database, client } of transactions) {
      try {
        if (database instanceof PostgresTestDB) {
          // Client is a PostgreSQL client with query and release methods
          await (client as { query: (sql: string) => Promise<unknown>; release: () => void }).query(
            'ROLLBACK'
          );
          (client as { query: (sql: string) => Promise<unknown>; release: () => void }).release();
        }
        result.rolledBack.push(this.getDatabaseId(database));
      } catch (error) {
        const error_ = error instanceof Error ? error : new Error(String(error));
        result.errors.push({
          database: this.getDatabaseId(database),
          error: `Rollback failed: ${error_.message}`,
        });
      }
    }
  }

  private async executeCompensations(
    operations: DatabaseOperation[],
    compensations: Array<(database: PostgresTestDB | MongoDBTestDB) => Promise<void>>,
    result: CoordinationResult
  ): Promise<void> {
    for (let index = operations.length - 1; index >= 0; index--) {
      const operation = operations[index];
      const compensation = compensations[index];

      if (compensation && operation) {
        try {
          await compensation(operation.database);
          result.rolledBack.push(this.getDatabaseId(operation.database));
        } catch (error) {
          const error_ = error instanceof Error ? error : new Error(String(error));
          result.errors.push({
            database: this.getDatabaseId(operation.database),
            error: `Compensation failed: ${error_.message}`,
          });
        }
      }
    }
  }

  private getDatabaseId(database: PostgresTestDB | MongoDBTestDB): string {
    const config = database.getConfig();
    if ('host' in config) {
      return `postgres://${config.host}:${config.port}/${config.database}`;
    } else {
      return `mongodb://${config.database}`;
    }
  }
}

// Convenience functions
export const executeCoordinatedTransaction = (
  operations: DatabaseOperation[],
  config?: TransactionConfig
): Promise<CoordinationResult> => {
  const coordinator = new MultiDatabaseCoordinator();
  return coordinator.executeCoordinatedTransaction(operations, config);
};

export const executeSagaTransaction = (
  operations: DatabaseOperation[],
  compensations: Array<(database: PostgresTestDB | MongoDBTestDB) => Promise<void>>
): Promise<CoordinationResult> => {
  const coordinator = new MultiDatabaseCoordinator();
  return coordinator.executeSagaTransaction(operations, compensations);
};

export const executeEventuallyConsistent = (
  operations: DatabaseOperation[],
  consistencyTimeout?: number
): Promise<CoordinationResult> => {
  const coordinator = new MultiDatabaseCoordinator();
  return coordinator.executeEventuallyConsistent(operations, consistencyTimeout);
};

export const checkMultiDatabaseConsistency = (
  databases: Array<PostgresTestDB | MongoDBTestDB>,
  consistencyCheck: (databases: Array<PostgresTestDB | MongoDBTestDB>) => Promise<boolean>
): Promise<{
  isConsistent: boolean;
  checkDuration: number;
  details: Record<string, unknown>;
}> => {
  const coordinator = new MultiDatabaseCoordinator();
  return coordinator.checkConsistency(databases, consistencyCheck);
};
