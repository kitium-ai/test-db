/**
 * Enhanced chaos engineering utilities for database testing
 */

import { randomUUID } from 'crypto';

import { MongoDBTestDB } from '../mongodb/client.js';
import { PostgresTestDB } from '../postgres/client.js';
import { createLogger, type ILogger } from './logging.js';
import { withSpan } from './telemetry.js';

export interface DatabaseChaosConfig {
  operation: 'connection' | 'query' | 'transaction' | 'index' | 'lock';
  failureMode: 'timeout' | 'disconnect' | 'corruption' | 'slow' | 'deadlock';
  probability: number;
  duration?: string;
  targetTables?: string[];
  targetCollections?: string[];
}

export interface NetworkChaosConfig {
  latency: number;
  jitter?: number;
  packetLoss?: number;
  corruption?: number;
  duration: string;
}

export interface MultiDatabaseChaosConfig {
  databases: Array<{
    database: PostgresTestDB | MongoDBTestDB;
    config: DatabaseChaosConfig;
  }>;
  coordinationMode: 'sequential' | 'parallel' | 'staggered';
  staggerDelay?: number;
}

export interface ChaosExperiment {
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
}

export interface ChaosResult {
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
}

export class DatabaseChaosOrchestrator {
  private readonly logger: ILogger;
  private activeExperiments: Map<string, ChaosExperiment> = new Map();
  private chaosStates: Map<string, boolean> = new Map();

  constructor() {
    this.logger = createLogger('DatabaseChaosOrchestrator');
  }

  /**
   * Inject database-specific chaos
   */
  public async injectDatabaseChaos(
    database: PostgresTestDB | MongoDBTestDB,
    config: DatabaseChaosConfig,
    duration: string = '30s'
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

        const promises = config.databases.map(async (dbConfig, index) => {
          if (config.coordinationMode === 'staggered' && config.staggerDelay) {
            await this.sleep(index * config.staggerDelay);
          }

          return this.injectDatabaseChaos(dbConfig.database, dbConfig.config);
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
    const result: ChaosResult = {
      experimentId: experiment.id,
      success: true,
      duration: 0,
      triggeredFailures: [],
      safetyViolations: [],
      metrics: {},
      errors: [],
    };

    try {
      await withSpan('chaos.experiment.run', async () => {
        this.activeExperiments.set(experiment.id, experiment);
        this.logger.info('Starting chaos experiment', {
          experimentId: experiment.id,
          name: experiment.name,
        });

        const promises: Promise<void>[] = [];

        // Database chaos
        if (experiment.databaseChaos) {
          for (const chaosConfig of experiment.databaseChaos) {
            // Note: This would need actual database instances
            // For now, we'll just log the intent
            this.logger.info('Would inject database chaos', { config: chaosConfig });
          }
        }

        // Network chaos
        if (experiment.networkChaos) {
          promises.push(this.injectNetworkChaos(experiment.networkChaos));
        }

        // Multi-database chaos
        if (experiment.multiDatabaseChaos) {
          promises.push(this.injectMultiDatabaseChaos(experiment.multiDatabaseChaos));
        }

        await Promise.all(promises);

        const durationMs = this.parseDuration(experiment.duration);
        await this.sleep(durationMs);

        result.duration = Date.now() - startTime;
        this.logger.info('Chaos experiment completed', {
          experimentId: experiment.id,
          duration: result.duration,
        });
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

  /**
   * Simulate database connection failures
   */
  public async simulateConnectionFailure(
    database: PostgresTestDB | MongoDBTestDB,
    duration: string = '5s'
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
    multiplier: number = 2,
    duration: string = '30s'
  ): Promise<void> {
    const durationMs = this.parseDuration(duration);
    const chaosKey = `slow_queries_${randomUUID()}`;
    const dbType = database instanceof PostgresTestDB ? 'PostgreSQL' : 'MongoDB';

    try {
      await withSpan('database.slow.queries.simulate', async () => {
        this.logger.info('Simulating slow queries', {
          database: dbType,
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
    switch (config.failureMode) {
      case 'timeout':
        await this.simulateTimeout(database, config.duration || '5s');
        break;
      case 'disconnect':
        await this.simulateConnectionFailure(database, config.duration || '2s');
        break;
      case 'slow':
        await this.simulateSlowQueries(database, 3, config.duration || '10s');
        break;
      case 'deadlock':
        if (database instanceof PostgresTestDB && config.targetTables?.length === 2) {
          const table1 = config.targetTables[0] || 'table1';
          const table2 = config.targetTables[1] || 'table2';
          await this.simulateDeadlock(database, table1, table2);
        }
        break;
      default:
        this.logger.warn('Unknown failure mode', { mode: config.failureMode });
    }
  }

  private async simulateTimeout(
    database: PostgresTestDB | MongoDBTestDB,
    duration: string
  ): Promise<void> {
    const dbType = database instanceof PostgresTestDB ? 'PostgreSQL' : 'MongoDB';
    this.logger.debug('Simulating timeout', { database: dbType, duration });
    const durationMs = this.parseDuration(duration);
    await this.sleep(durationMs);
    throw new Error('Simulated timeout');
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)(ms|s|m|h)$/);
    if (!match) {
      throw new Error(`Invalid duration format: ${duration}`);
    }

    const value = parseInt(match[1] || '0', 10);
    const unit = match[2];

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

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
