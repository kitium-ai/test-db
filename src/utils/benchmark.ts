/**
 * Performance benchmarking suite for database testing
 */

import { performance } from 'node:perf_hooks';

import type { MongoDBTestDB } from '../mongodb/client.js';
import { PostgresTestDB } from '../postgres/client.js';
import { createLogger, type ILogger } from './logging.js';
import { withSpan } from './telemetry.js';

export type QueryBenchmark = {
  name: string;
  query: string;
  parameters?: unknown[];
  iterations?: number;
  warmupIterations?: number;
};

export type BenchmarkResult = {
  name: string;
  totalTime: number;
  averageTime: number;
  medianTime: number;
  minTime: number;
  maxTime: number;
  p95Time: number;
  p99Time: number;
  iterations: number;
  throughput: number; // operations per second
  memoryUsage?: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
  errors: number;
};

export type ConnectionPoolBenchmark = {
  name: string;
  concurrentConnections: number;
  duration: number;
  operationsPerConnection: number;
};

export type LoadTestScenario = {
  name: string;
  duration: string;
  concurrency: number;
  operations: Array<{
    weight: number; // Relative frequency
    operation: () => Promise<void>;
  }>;
};

export type LoadTestResult = {
  scenario: string;
  duration: number;
  totalOperations: number;
  throughput: number;
  latency: {
    average: number;
    p95: number;
    p99: number;
  };
  errors: number;
  metrics: Record<string, number[]>;
};

export class DatabaseBenchmarkSuite {
  private readonly logger: ILogger;

  constructor() {
    this.logger = createLogger('DatabaseBenchmarkSuite');
  }

  /**
   * Benchmark query performance
   */
  public async benchmarkQueries(
    database: PostgresTestDB | MongoDBTestDB,
    benchmarks: QueryBenchmark[]
  ): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    for (const benchmark of benchmarks) {
      try {
        const result = await this.runQueryBenchmark(database, benchmark);
        results.push(result);
        this.logger.info('Query benchmark completed', {
          name: benchmark.name,
          averageTime: result.averageTime,
          throughput: result.throughput,
        });
      } catch (error) {
        const error_ = error instanceof Error ? error : new Error(String(error));
        this.logger.error('Query benchmark failed', {
          name: benchmark.name,
          error: error_.message,
        });
        results.push({
          name: benchmark.name,
          totalTime: 0,
          averageTime: 0,
          medianTime: 0,
          minTime: 0,
          maxTime: 0,
          p95Time: 0,
          p99Time: 0,
          iterations: 0,
          throughput: 0,
          errors: 1,
        });
      }
    }

    return results;
  }

  /**
   * Benchmark connection pool performance
   */
  public benchmarkConnectionPool(
    database: PostgresTestDB | MongoDBTestDB,
    config: ConnectionPoolBenchmark
  ): Promise<BenchmarkResult> {
    return withSpan('connection.pool.benchmark', () =>
      this.runConnectionPoolBenchmark(database, config)
    );
  }

  private async runConnectionPoolBenchmark(
    database: PostgresTestDB | MongoDBTestDB,
    config: ConnectionPoolBenchmark
  ): Promise<BenchmarkResult> {
    this.logger.info('Starting connection pool benchmark', { name: config.name });

    const startTime = performance.now();
    const totals = { operations: 0, errors: 0 };

    const workers = Array.from({ length: config.concurrentConnections }, (_, index) =>
      this.runConnectionPoolWorker(database, config.operationsPerConnection, index, totals)
    );

    await Promise.all(workers);
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const averageTime = totals.operations === 0 ? 0 : totalTime / totals.operations;

    const result: BenchmarkResult = {
      name: config.name,
      totalTime,
      averageTime,
      medianTime: averageTime, // Simplified
      minTime: 0, // Would need to track individual times
      maxTime: 0,
      p95Time: 0,
      p99Time: 0,
      iterations: totals.operations,
      throughput: totalTime === 0 ? 0 : totals.operations / (totalTime / 1000), // ops per second
      errors: totals.errors,
    };

    this.logger.info('Connection pool benchmark completed', {
      name: config.name,
      throughput: result.throughput,
      errors: totals.errors,
    });

    return result;
  }

  private async runConnectionPoolWorker(
    database: PostgresTestDB | MongoDBTestDB,
    operationsPerConnection: number,
    connectionIndex: number,
    totals: { operations: number; errors: number }
  ): Promise<void> {
    try {
      for (let index = 0; index < operationsPerConnection; index++) {
        await this.executeBenchmarkQuery(database, { name: 'noop', query: 'SELECT 1' });
        totals.operations++;
      }
    } catch (error) {
      totals.errors++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('Connection pool operation failed', {
        connection: connectionIndex,
        error: errorMessage,
      });
    }
  }

  /**
   * Run load test scenario
   */
  public runLoadTest(
    database: PostgresTestDB | MongoDBTestDB,
    scenario: LoadTestScenario
  ): Promise<LoadTestResult> {
    return withSpan('load.test.run', () => this.runLoadTestInternal(database, scenario));
  }

  private async runLoadTestInternal(
    database: PostgresTestDB | MongoDBTestDB,
    scenario: LoadTestScenario
  ): Promise<LoadTestResult> {
    const databaseType = database instanceof PostgresTestDB ? 'PostgreSQL' : 'MongoDB';
    this.logger.info('Starting load test', { scenario: scenario.name, database: databaseType });

    const durationMs = this.parseDuration(scenario.duration);
    const endTime = Date.now() + durationMs;

    const counters = { operations: 0, errors: 0 };
    const latencies: number[] = [];
    const metrics: Record<string, number[]> = {};

    const operations = this.calculateWeightedOperations(scenario.operations);
    const workers = Array.from({ length: scenario.concurrency }, () =>
      this.runLoadTestWorker(endTime, operations, latencies, metrics, counters)
    );

    await Promise.all(workers);

    const result = this.buildLoadTestResult(
      scenario.name,
      durationMs,
      counters,
      latencies,
      metrics
    );
    this.logger.info('Load test completed', {
      scenario: scenario.name,
      throughput: result.throughput,
      averageLatency: result.latency.average,
      errors: result.errors,
    });

    return result;
  }

  private calculateWeightedOperations(
    operations: LoadTestScenario['operations']
  ): Array<LoadTestScenario['operations'][number] & { probability: number }> {
    const totalWeight = operations.reduce((sum, operation) => sum + operation.weight, 0);
    return operations.map((operation) => ({
      ...operation,
      probability: operation.weight / totalWeight,
    }));
  }

  private async runLoadTestWorker(
    endTime: number,
    operations: Array<LoadTestScenario['operations'][number] & { probability: number }>,
    latencies: number[],
    metrics: Record<string, number[]>,
    counters: { operations: number; errors: number }
  ): Promise<void> {
    while (Date.now() < endTime) {
      try {
        const selected = this.selectWeightedOperation(operations);
        const startTime = performance.now();

        await selected.operation();

        const latency = performance.now() - startTime;
        latencies.push(latency);
        counters.operations++;
        this.collectMetrics(metrics, latency);
      } catch (_error) {
        void _error;
        counters.errors++;
      }
    }
  }

  private buildLoadTestResult(
    scenario: string,
    durationMs: number,
    counters: { operations: number; errors: number },
    latencies: number[],
    metrics: Record<string, number[]>
  ): LoadTestResult {
    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    const totalLatency = latencies.reduce((sum, latency) => sum + latency, 0);
    const averageLatency = latencies.length === 0 ? 0 : totalLatency / latencies.length;

    return {
      scenario,
      duration: durationMs,
      totalOperations: counters.operations,
      throughput: durationMs === 0 ? 0 : counters.operations / (durationMs / 1000),
      latency: {
        average: averageLatency,
        p95: sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] ?? 0,
        p99: sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] ?? 0,
      },
      errors: counters.errors,
      metrics,
    };
  }

  /**
   * Benchmark transaction performance
   */
  public async benchmarkTransactions(
    database: PostgresTestDB | MongoDBTestDB,
    transactionBenchmarks: Array<{
      name: string;
      operations: Array<() => Promise<void>>;
      iterations?: number;
    }>
  ): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    for (const benchmark of transactionBenchmarks) {
      try {
        const result = await this.runTransactionBenchmark(database, benchmark);
        results.push(result);
        this.logger.info('Transaction benchmark completed', {
          name: benchmark.name,
          averageTime: result.averageTime,
          throughput: result.throughput,
        });
      } catch (error) {
        const error_ = error instanceof Error ? error : new Error(String(error));
        this.logger.error('Transaction benchmark failed', {
          name: benchmark.name,
          error: error_.message,
        });
      }
    }

    return results;
  }

  /**
   * Profile memory usage during operations
   */
  public async profileMemoryUsage(
    database: PostgresTestDB | MongoDBTestDB,
    operation: () => Promise<void>,
    iterations = 100
  ): Promise<{
    memoryUsage: Array<{
      before: NodeJS.MemoryUsage;
      after: NodeJS.MemoryUsage;
      operation: number;
    }>;
    averageMemoryDelta: {
      rss: number;
      heapUsed: number;
      heapTotal: number;
    };
  }> {
    const databaseType = database instanceof PostgresTestDB ? 'PostgreSQL' : 'MongoDB';
    this.logger.info('Profiling memory usage', { database: databaseType, iterations });

    const memoryUsage: Array<{
      before: NodeJS.MemoryUsage;
      after: NodeJS.MemoryUsage;
      operation: number;
    }> = [];

    for (let index = 0; index < iterations; index++) {
      const before = process.memoryUsage();
      await operation();
      const after = process.memoryUsage();

      memoryUsage.push({ before, after, operation: index });
    }

    const deltas = memoryUsage.map((usage) => ({
      rss: usage.after.rss - usage.before.rss,
      heapUsed: usage.after.heapUsed - usage.before.heapUsed,
      heapTotal: usage.after.heapTotal - usage.before.heapTotal,
    }));

    const averageMemoryDelta = {
      rss: deltas.reduce((sum, delta) => sum + delta.rss, 0) / deltas.length,
      heapUsed: deltas.reduce((sum, delta) => sum + delta.heapUsed, 0) / deltas.length,
      heapTotal: deltas.reduce((sum, delta) => sum + delta.heapTotal, 0) / deltas.length,
    };

    return { memoryUsage, averageMemoryDelta };
  }

  /**
   * Compare performance across different database configurations
   */
  public async compareConfigurations(
    configs: Array<{
      name: string;
      database: PostgresTestDB | MongoDBTestDB;
      benchmark: QueryBenchmark;
    }>
  ): Promise<
    Array<{
      config: string;
      result: BenchmarkResult;
      rank: number;
    }>
  > {
    const results = await Promise.all(
      configs.map(async (config) => ({
        config: config.name,
        result: await this.runQueryBenchmark(config.database, config.benchmark),
      }))
    );

    // Rank by average time (lower is better)
    const sorted = results.sort((a, b) => a.result.averageTime - b.result.averageTime);
    return sorted.map((result, index) => ({
      ...result,
      rank: index + 1,
    }));
  }

  private async runQueryBenchmark(
    database: PostgresTestDB | MongoDBTestDB,
    benchmark: QueryBenchmark
  ): Promise<BenchmarkResult> {
    const iterations = benchmark.iterations ?? 100;
    const warmupIterations = benchmark.warmupIterations ?? 10;
    const times: number[] = [];

    // Warmup
    for (let index = 0; index < warmupIterations; index++) {
      await this.executeBenchmarkQuery(database, benchmark);
    }

    // Benchmark
    let errors = 0;
    for (let index = 0; index < iterations; index++) {
      try {
        const startTime = performance.now();

        await this.executeBenchmarkQuery(database, benchmark);

        const endTime = performance.now();
        times.push(endTime - startTime);
      } catch (_error) {
        void _error; // Mark as intentionally unused
        errors++;
      }
    }

    const sortedTimes = times.sort((a, b) => a - b);
    const totalTime = times.reduce((sum, time) => sum + time, 0);
    const averageTime = totalTime / times.length;
    const throughput = times.length / (totalTime / 1000);

    return {
      name: benchmark.name,
      totalTime,
      averageTime,
      medianTime: sortedTimes[Math.floor(sortedTimes.length / 2)] ?? 0,
      minTime: sortedTimes[0] ?? 0,
      maxTime: sortedTimes[sortedTimes.length - 1] ?? 0,
      p95Time: sortedTimes[Math.floor(sortedTimes.length * 0.95)] ?? 0,
      p99Time: sortedTimes[Math.floor(sortedTimes.length * 0.99)] ?? 0,
      iterations: times.length,
      throughput,
      memoryUsage: process.memoryUsage(),
      errors,
    };
  }

  private async executeBenchmarkQuery(
    database: PostgresTestDB | MongoDBTestDB,
    benchmark: QueryBenchmark
  ): Promise<void> {
    if (database instanceof PostgresTestDB) {
      await database.query(benchmark.query, benchmark.parameters);
      return;
    }
    await database.execute(benchmark.query, benchmark.parameters);
  }

  private async runTransactionBenchmark(
    database: PostgresTestDB | MongoDBTestDB,
    benchmark: { name: string; operations: Array<() => Promise<void>>; iterations?: number }
  ): Promise<BenchmarkResult> {
    const iterations = benchmark.iterations ?? 50;
    const times: number[] = [];
    let errors = 0;

    for (let index = 0; index < iterations; index++) {
      try {
        const startTime = performance.now();

        if (database instanceof PostgresTestDB) {
          await database.transaction(async (client) => {
            // Transaction client available for operations if needed
            void client; // Mark as intentionally unused for now
            for (const operation of benchmark.operations) {
              await operation();
            }
          });
        } else {
          await database.transaction(async (session) => {
            // Transaction session available for operations if needed
            void session; // Mark as intentionally unused for now
            for (const operation of benchmark.operations) {
              await operation();
            }
          });
        }

        const endTime = performance.now();
        times.push(endTime - startTime);
      } catch (_error) {
        void _error; // Mark as intentionally unused
        errors++;
      }
    }

    const sortedTimes = times.sort((a, b) => a - b);
    const totalTime = times.reduce((sum, time) => sum + time, 0);
    const averageTime = totalTime / times.length;
    const throughput = times.length / (totalTime / 1000);

    return {
      name: benchmark.name,
      totalTime,
      averageTime,
      medianTime: sortedTimes[Math.floor(sortedTimes.length / 2)] ?? 0,
      minTime: sortedTimes[0] ?? 0,
      maxTime: sortedTimes[sortedTimes.length - 1] ?? 0,
      p95Time: sortedTimes[Math.floor(sortedTimes.length * 0.95)] ?? 0,
      p99Time: sortedTimes[Math.floor(sortedTimes.length * 0.99)] ?? 0,
      iterations: times.length,
      throughput,
      errors,
    };
  }

  private selectWeightedOperation<T extends { probability: number }>(operations: T[]): T {
    if (operations.length === 0) {
      throw new Error('Cannot select from empty operations array');
    }

    const random = Math.random();
    let cumulativeProbability = 0;

    for (const operation of operations) {
      cumulativeProbability += operation.probability;
      if (random <= cumulativeProbability) {
        return operation;
      }
    }

    const fallback = operations[operations.length - 1];
    if (fallback === undefined) {
      throw new Error('Cannot select from empty operations array');
    }
    return fallback;
  }

  private collectMetrics(metrics: Record<string, number[]>, latency: number): void {
    // Collect latency percentiles
    metrics['latency'] ??= [];
    metrics['latency'].push(latency);

    // Collect throughput (would need time windows)
    // This is a simplified version
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
}

// Convenience functions
export const benchmarkDatabaseQueries = (
  database: PostgresTestDB | MongoDBTestDB,
  benchmarks: QueryBenchmark[]
): Promise<BenchmarkResult[]> => {
  const suite = new DatabaseBenchmarkSuite();
  return suite.benchmarkQueries(database, benchmarks);
};

export const benchmarkConnectionPool = (
  database: PostgresTestDB | MongoDBTestDB,
  config: ConnectionPoolBenchmark
): Promise<BenchmarkResult> => {
  const suite = new DatabaseBenchmarkSuite();
  return suite.benchmarkConnectionPool(database, config);
};

export const runDatabaseLoadTest = (
  database: PostgresTestDB | MongoDBTestDB,
  scenario: LoadTestScenario
): Promise<{
  scenario: string;
  duration: number;
  totalOperations: number;
  throughput: number;
  latency: {
    average: number;
    p95: number;
    p99: number;
  };
  errors: number;
  metrics: Record<string, number[]>;
}> => {
  const suite = new DatabaseBenchmarkSuite();
  return suite.runLoadTest(database, scenario);
};

export const benchmarkDatabaseTransactions = (
  database: PostgresTestDB | MongoDBTestDB,
  benchmarks: Array<{
    name: string;
    operations: Array<() => Promise<void>>;
    iterations?: number;
  }>
): Promise<BenchmarkResult[]> => {
  const suite = new DatabaseBenchmarkSuite();
  return suite.benchmarkTransactions(database, benchmarks);
};

export const profileDatabaseMemoryUsage = (
  database: PostgresTestDB | MongoDBTestDB,
  operation: () => Promise<void>,
  iterations?: number
): Promise<{
  memoryUsage: Array<{
    before: NodeJS.MemoryUsage;
    after: NodeJS.MemoryUsage;
    operation: number;
  }>;
  averageMemoryDelta: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
}> => {
  const suite = new DatabaseBenchmarkSuite();
  return suite.profileMemoryUsage(database, operation, iterations);
};
