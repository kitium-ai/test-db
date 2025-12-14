/**
 * Enhanced chaos engineering utilities for database testing
 */

import { randomUUID } from 'node:crypto';

import type { MongoDBTestDB } from '../mongodb/client.js';
import { PostgresTestDB } from '../postgres/client.js';
import { createLogger, type ILogger } from './logging.js';
import { withSpan } from './telemetry.js';

export type DatabaseChaosConfig = {
  operation: 'connection' | 'query' | 'transaction' | 'index' | 'lock';
  failureMode: 'timeout' | 'disconnect' | 'corruption' | 'slow' | 'deadlock';
  probability: number;
  duration?: string;
  targetTables?: string[];
  targetCollections?: string[];
};

export type NetworkChaosConfig = {
  latency: number;
  jitter?: number;
  packetLoss?: number;
  corruption?: number;
  duration: string;
};

export type MultiDatabaseChaosConfig = {
  databases: Array<{
    database: PostgresTestDB | MongoDBTestDB;
    config: DatabaseChaosConfig;
  }>;
  coordinationMode: 'sequential' | 'parallel' | 'staggered';
  staggerDelay?: number;
};

export type ChaosExperiment = {
  id: string;
  name: string;
  description?: string;
  duration: string;
  databaseChaos?: DatabaseChaosConfig[];
  networkChaos?: NetworkChaosConfig;
  multiDatabaseChaos?: MultiDatabaseChaosConfig;
  safetyConditions?: Array<{
    metric: string;
    threshold: number;
    operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  }>;
};

export type ChaosResult = {
  experimentId: string;
  success: boolean;
  duration: number;
  triggeredFailures: Array<{
    type: string;
    timestamp: number;
    target: string;
    details: Record<string, unknown>;
  }>;
  safetyViolations: Array<{
    condition: string;
    value: number;
    threshold: number;
    timestamp: number;
  }>;
  metrics: Record<string, number[]>;
  errors: string[];
};

export class DatabaseChaosOrchestrator {
  private readonly logger: ILogger;
  private readonly activeExperiments: Map<string, ChaosExperiment> = new Map();
  private readonly chaosStates: Map<string, boolean> = new Map();

  constructor() {
    this.logger = createLogger('DatabaseChaosOrchestrator');
  }

  /**
   * Inject database-specific chaos
   */
  public async injectDatabaseChaos(
    database: PostgresTestDB | MongoDBTestDB,
    config: DatabaseChaosConfig,
    duration = '30s'
  ): Promise<void> {
    const experimentId = randomUUID();

    try {
      await withSpan('database.chaos.inject', async () => {
        this.logger.info('Injecting database chaos', { experimentId, config });

        const durationMs = this.parseDuration(duration);
        const endTime = Date.now() + durationMs;

        while (Date.now() < endTime) {
          if (Math.random() < config.probability) {
            await this.triggerDatabaseFailure(database, config);
          }
          await this.sleep(100); // Check every 100ms
        }
      });

      this.logger.info('Database chaos injection completed', { experimentId });
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Database chaos injection failed', { experimentId, error: error_.message });
      throw error_;
    }
  }

  /**
   * Inject network chaos affecting database connections
   */
  public async injectNetworkChaos(config: NetworkChaosConfig): Promise<void> {
    const experimentId = randomUUID();

    try {
      await withSpan('network.chaos.inject', async () => {
        this.logger.info('Injecting network chaos', { experimentId, config });

        // This would typically use tools like tc (traffic control) or toxiproxy
        // For now, we'll simulate the effects

        const durationMs = this.parseDuration(config.duration);
        const endTime = Date.now() + durationMs;

        while (Date.now() < endTime) {
          // Simulate network conditions
          if (config.latency > 0) {
            await this.sleep(config.latency + (config.jitter ? Math.random() * config.jitter : 0));
          }

          if (config.packetLoss && Math.random() < config.packetLoss / 100) {
            throw new Error('Simulated packet loss');
          }

          if (config.corruption && Math.random() < config.corruption / 100) {
            throw new Error('Simulated data corruption');
          }
        }
      });

      this.logger.info('Network chaos injection completed', { experimentId });
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Network chaos injection failed', { experimentId, error: error_.message });
      throw error_;
    }
  }

  /**
   * Run coordinated chaos across multiple databases
   */
  public async injectMultiDatabaseChaos(config: MultiDatabaseChaosConfig): Promise<void> {
    const experimentId = randomUUID();

    try {
      await withSpan('multi-database.chaos.inject', async () => {
        this.logger.info('Injecting multi-database chaos', { experimentId, config });

        const promises = config.databases.map(async (databaseConfig, index) => {
          if (config.coordinationMode === 'staggered' && config.staggerDelay) {
            await this.sleep(index * config.staggerDelay);
          }

          return this.injectDatabaseChaos(databaseConfig.database, databaseConfig.config);
        });

        if (config.coordinationMode === 'sequential') {
          for (const promise of promises) {
            await promise;
          }
        } else {
          await Promise.all(promises);
        }
      });

      this.logger.info('Multi-database chaos injection completed', { experimentId });
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Multi-database chaos injection failed', {
        experimentId,
        error: error_.message,
      });
      throw error_;
    }
  }

  /**
   * Run a complete chaos experiment
   */
  public async runChaosExperiment(experiment: ChaosExperiment): Promise<ChaosResult> {
    const startTime = Date.now();
    const result = this.createEmptyResult(experiment.id);

    try {
      await withSpan('chaos.experiment.run', async () => {
        await this.runExperimentSteps(experiment, startTime, result);
      });
    } catch (error) {
      result.success = false;
      const error_ = error instanceof Error ? error : new Error(String(error));
      result.errors.push(error_.message);
      this.logger.error('Chaos experiment failed', {
        experimentId: experiment.id,
        error: error_.message,
      });
    } finally {
      this.activeExperiments.delete(experiment.id);
    }

    return result;
  }

  private createEmptyResult(experimentId: string): ChaosResult {
    return {
      experimentId,
      success: true,
      duration: 0,
      triggeredFailures: [],
      safetyViolations: [],
      metrics: {},
      errors: [],
    };
  }

  private async runExperimentSteps(
    experiment: ChaosExperiment,
    startTime: number,
    result: ChaosResult
  ): Promise<void> {
    this.activeExperiments.set(experiment.id, experiment);
    this.logger.info('Starting chaos experiment', {
      experimentId: experiment.id,
      name: experiment.name,
    });

    await this.runExperimentChaos(experiment);

    const durationMs = this.parseDuration(experiment.duration);
    await this.sleep(durationMs);

    result.duration = Date.now() - startTime;
    this.logger.info('Chaos experiment completed', {
      experimentId: experiment.id,
      duration: result.duration,
    });
  }

  private async runExperimentChaos(experiment: ChaosExperiment): Promise<void> {
    const promises: Array<Promise<void>> = [];

    if (experiment.databaseChaos) {
      for (const chaosConfig of experiment.databaseChaos) {
        // Note: This would need actual database instances.
        this.logger.info('Would inject database chaos', { config: chaosConfig });
      }
    }

    if (experiment.networkChaos) {
      promises.push(this.injectNetworkChaos(experiment.networkChaos));
    }

    if (experiment.multiDatabaseChaos) {
      promises.push(this.injectMultiDatabaseChaos(experiment.multiDatabaseChaos));
    }

    await Promise.all(promises);
  }

  /**
   * Simulate database connection failures
   */
  public async simulateConnectionFailure(
    database: PostgresTestDB | MongoDBTestDB,
    duration = '5s'
  ): Promise<void> {
    const durationMs = this.parseDuration(duration);

    try {
      await withSpan('database.connection.failure.simulate', async () => {
        this.logger.info('Simulating connection failure', { duration: durationMs });

        // Disconnect the database
        await database.disconnect();

        // Wait for the specified duration
        await this.sleep(durationMs);

        // Reconnect
        await database.connect();

        this.logger.info('Connection failure simulation completed');
      });
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Connection failure simulation failed', { error: error_.message });
      throw error_;
    }
  }

  /**
   * Simulate slow queries
   */
  public async simulateSlowQueries(
    database: PostgresTestDB | MongoDBTestDB,
    multiplier = 2,
    duration = '30s'
  ): Promise<void> {
    const durationMs = this.parseDuration(duration);
    const chaosKey = `slow_queries_${randomUUID()}`;
    const databaseType = database instanceof PostgresTestDB ? 'PostgreSQL' : 'MongoDB';

    try {
      await withSpan('database.slow.queries.simulate', async () => {
        this.logger.info('Simulating slow queries', {
          database: databaseType,
          multiplier,
          duration: durationMs,
        });
        this.chaosStates.set(chaosKey, true);

        const endTime = Date.now() + durationMs;
        while (Date.now() < endTime && this.chaosStates.get(chaosKey)) {
          // Add artificial delay to queries
          await this.sleep(100 * multiplier);
        }

        this.logger.info('Slow query simulation completed');
      });
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Slow query simulation failed', { error: error_.message });
      throw error_;
    } finally {
      this.chaosStates.delete(chaosKey);
    }
  }

  /**
   * Simulate deadlock scenarios
   */
  public async simulateDeadlock(
    database: PostgresTestDB,
    table1: string,
    table2: string
  ): Promise<void> {
    try {
      await withSpan('database.deadlock.simulate', async () => {
        this.logger.info('Simulating deadlock', { table1, table2 });

        // Create a deadlock scenario with two concurrent transactions
        const client1 = await database.leaseClient();
        const client2 = await database.leaseClient();

        try {
          // Transaction 1: Lock table1 then table2
          await client1.query('BEGIN');
          await client1.query(`LOCK TABLE ${table1} IN EXCLUSIVE MODE`);

          // Small delay to ensure transaction 2 starts
          await this.sleep(100);

          // Transaction 2: Lock table2 then table1 (deadlock!)
          await client2.query('BEGIN');
          await client2.query(`LOCK TABLE ${table2} IN EXCLUSIVE MODE`);

          // This should cause a deadlock
          await Promise.allSettled([
            client1.query(`LOCK TABLE ${table2} IN EXCLUSIVE MODE`),
            client2.query(`LOCK TABLE ${table1} IN EXCLUSIVE MODE`),
          ]);
        } finally {
          await client1.query('ROLLBACK').catch(() => {});
          await client2.query('ROLLBACK').catch(() => {});
          client1.release();
          client2.release();
        }

        this.logger.info('Deadlock simulation completed');
      });
    } catch (error) {
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Deadlock simulation failed', { error: error_.message });
      throw error_;
    }
  }

  /**
   * Stop all active chaos experiments
   */
  public stopAllExperiments(): void {
    this.activeExperiments.clear();
    this.chaosStates.clear();
    this.logger.info('All chaos experiments stopped');
  }

  private async triggerDatabaseFailure(
    database: PostgresTestDB | MongoDBTestDB,
    config: DatabaseChaosConfig
  ): Promise<void> {
    const durationByMode: Record<DatabaseChaosConfig['failureMode'], string> = {
      timeout: '5s',
      disconnect: '2s',
      corruption: '1s',
      slow: '10s',
      deadlock: '5s',
    };

    const duration = config.duration ?? durationByMode[config.failureMode];

    const handlers: Record<DatabaseChaosConfig['failureMode'], () => Promise<void>> = {
      timeout: () => this.simulateTimeout(database, duration),
      disconnect: () => this.simulateConnectionFailure(database, duration),
      corruption: () => this.simulateDataCorruption(database, config),
      slow: () => this.simulateSlowQueries(database, 3, duration),
      deadlock: () => this.simulateDeadlockFailure(database, config),
    };

    await handlers[config.failureMode]();
  }

  private async simulateDeadlockFailure(
    database: PostgresTestDB | MongoDBTestDB,
    config: DatabaseChaosConfig
  ): Promise<void> {
    if (!(database instanceof PostgresTestDB)) {
      this.logger.warn('Deadlock simulation is only supported for PostgreSQL');
      return;
    }

    const table1 = config.targetTables?.[0] ?? 'table1';
    const table2 = config.targetTables?.[1] ?? 'table2';
    await this.simulateDeadlock(database, table1, table2);
  }

  private simulateDataCorruption(
    database: PostgresTestDB | MongoDBTestDB,
    config: DatabaseChaosConfig
  ): Promise<void> {
    const databaseType = database instanceof PostgresTestDB ? 'PostgreSQL' : 'MongoDB';
    this.logger.warn('Simulating data corruption', {
      database: databaseType,
      targets: config.targetTables ?? config.targetCollections,
    });
    throw new Error('Simulated data corruption');
  }

  private async simulateTimeout(
    database: PostgresTestDB | MongoDBTestDB,
    duration: string
  ): Promise<void> {
    const databaseType = database instanceof PostgresTestDB ? 'PostgreSQL' : 'MongoDB';
    this.logger.debug('Simulating timeout', { database: databaseType, duration });
    const durationMs = this.parseDuration(duration);
    await this.sleep(durationMs);
    throw new Error('Simulated timeout');
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)(ms|s|m|h)$/);
    if (!match) {
      throw new Error(`Invalid duration format: ${duration}`);
    }

    const value = parseInt(match[1] ?? '0', 10);
    const unit = match[2];
    if (!unit) {
      throw new Error(`Invalid duration unit: ${duration}`);
    }

    switch (unit) {
      case 'ms':
        return value;
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      default:
        return value;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}

// Convenience functions
export const injectDatabaseChaos = (
  database: PostgresTestDB | MongoDBTestDB,
  config: DatabaseChaosConfig,
  duration?: string
): Promise<void> => {
  const orchestrator = new DatabaseChaosOrchestrator();
  return orchestrator.injectDatabaseChaos(database, config, duration);
};

export const injectNetworkChaos = (config: NetworkChaosConfig): Promise<void> => {
  const orchestrator = new DatabaseChaosOrchestrator();
  return orchestrator.injectNetworkChaos(config);
};

export const injectMultiDatabaseChaos = (config: MultiDatabaseChaosConfig): Promise<void> => {
  const orchestrator = new DatabaseChaosOrchestrator();
  return orchestrator.injectMultiDatabaseChaos(config);
};

export const runChaosExperiment = (experiment: ChaosExperiment): Promise<ChaosResult> => {
  const orchestrator = new DatabaseChaosOrchestrator();
  return orchestrator.runChaosExperiment(experiment);
};

export const simulateConnectionFailure = (
  database: PostgresTestDB | MongoDBTestDB,
  duration?: string
): Promise<void> => {
  const orchestrator = new DatabaseChaosOrchestrator();
  return orchestrator.simulateConnectionFailure(database, duration);
};

export const simulateDeadlock = (
  database: PostgresTestDB,
  table1: string,
  table2: string
): Promise<void> => {
  const orchestrator = new DatabaseChaosOrchestrator();
  return orchestrator.simulateDeadlock(database, table1, table2);
};
