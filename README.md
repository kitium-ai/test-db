# @kitiumai/test-db

> **Enterprise-Grade Database Testing Infrastructure**

A comprehensive, production-ready testing framework for PostgreSQL and MongoDB that matches the sophistication of big tech database testing infrastructure. Built for teams that need hermetic, observable, and scalable database testing at enterprise scale.

## What is @kitiumai/test-db?

`@kitiumai/test-db` is a complete database testing ecosystem that provides:

- **Hermetic Testing Environment**: Docker-based isolated database instances
- **Enterprise Observability**: Distributed tracing, metrics, and alerting
- **AI-Powered Data Generation**: Realistic test data with business rule compliance
- **Chaos Engineering**: Failure injection and resilience testing
- **Multi-Database Coordination**: Cross-database transaction testing
- **Performance Benchmarking**: Load testing and performance analysis
- **Cloud Integration**: AWS RDS, Google Cloud SQL, Azure Database support

## Why Do You Need This Package?

### The Database Testing Problem

Traditional database testing approaches suffer from:

- **Data Leakage**: Tests contaminate each other with shared state
- **Slow Setup**: Manual database provisioning and seeding
- **Inconsistent Environments**: Different results across CI/local environments
- **Limited Observability**: No visibility into database performance or failures
- **Manual Chaos Testing**: No systematic way to test failure scenarios
- **Poor Data Quality**: Fake data that doesn't reflect real-world patterns

### The Enterprise Solution

`@kitiumai/test-db` solves these problems with:

- **Zero-Configuration Isolation**: Automatic per-test database isolation
- **Production-Grade Observability**: Full tracing and metrics collection
- **AI-Generated Realistic Data**: Statistically valid test datasets
- **Automated Chaos Engineering**: Systematic failure injection testing
- **Cloud-Native Architecture**: Multi-region and cloud provider support
- **Performance Intelligence**: Automated benchmarking and optimization

## Competitor Comparison

| Feature | @kitiumai/test-db | testcontainers | mongodb-memory-server | pg-mem | database-cleaner |
|---------|------------------|----------------|----------------------|--------|------------------|
| **PostgreSQL Support** | ✅ Full | ✅ Container | ❌ | ✅ In-memory | ❌ |
| **MongoDB Support** | ✅ Full | ✅ Container | ✅ Memory | ❌ | ❌ |
| **Hermetic Isolation** | ✅ Docker + Per-test | ✅ Container | ✅ Memory | ✅ In-memory | ❌ |
| **Enterprise Observability** | ✅ Tracing + Metrics | ❌ | ❌ | ❌ | ❌ |
| **AI Data Generation** | ✅ Statistical models | ❌ | ❌ | ❌ | ❌ |
| **Chaos Engineering** | ✅ Failure injection | ❌ | ❌ | ❌ | ❌ |
| **Cloud Integration** | ✅ AWS/GCP/Azure | ❌ | ❌ | ❌ | ❌ |
| **Performance Benchmarking** | ✅ Load testing | ❌ | ❌ | ❌ | ❌ |
| **Multi-DB Coordination** | ✅ Saga patterns | ❌ | ❌ | ❌ | ❌ |
| **Schema Migration Testing** | ✅ Drift detection | ❌ | ❌ | ❌ | ❌ |
| **Production Ready** | ✅ Enterprise-grade | ⚠️ Dev-focused | ⚠️ Dev-focused | ⚠️ Limited | ⚠️ Basic |

## Unique Selling Proposition (USP)

### 🏗️ **Big Tech Standards, Open Source Price**
Built using the same patterns and infrastructure as Google, Meta, Amazon, and Netflix database testing frameworks.

### 🤖 **AI-Powered Testing Intelligence**
Automatically generates realistic test data, learns from your schemas, and validates business rules - no more manual fixture creation.

### 🔬 **Chaos Engineering Built-in**
Systematically test failure scenarios, network partitions, and database outages before they happen in production.

### 📊 **Enterprise Observability**
Full distributed tracing, metrics collection, and alerting integrated with industry standards (OpenTelemetry, Prometheus, Jaeger).

### ☁️ **Cloud-Native Architecture**
Native support for AWS RDS, Google Cloud SQL, Azure Database with automatic provisioning and configuration.

### 🚀 **Zero-Configuration Developer Experience**
Drop into any project and start testing immediately - no complex setup or configuration required.

## Installation

```bash
npm install @kitiumai/test-db
# or
yarn add @kitiumai/test-db
# or
pnpm add @kitiumai/test-db
```

## Quick Start

### Basic PostgreSQL Testing

```typescript
import { createPostgresTestDB } from '@kitiumai/test-db';

describe('User Service', () => {
  let db: PostgresTestDB;

  beforeAll(async () => {
    db = createPostgresTestDB({
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'password',
      database: 'test_db',
    });
    await db.connect();
  });

  afterAll(async () => {
    await db.disconnect();
  });

  it('should create and retrieve user', async () => {
    // Create table
    await db.query(\`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL
      )
    \`);

    // Insert user
    await db.query(
      'INSERT INTO users (name, email) VALUES ($1, $2)',
      ['John Doe', 'john@example.com']
    );

    // Retrieve user
    const result = await db.query('SELECT * FROM users WHERE email = $1', ['john@example.com']);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('John Doe');
  });
});
```

### Hermetic Testing with Docker

```typescript
import { DockerContainerManager, HermeticDatabaseManager } from '@kitiumai/test-db/utils';

describe('Hermetic Database Tests', () => {
  let hermeticDB: HermeticDatabaseManager;

  beforeAll(async () => {
    const dockerManager = new DockerContainerManager();
    hermeticDB = new HermeticDatabaseManager(dockerManager);

    await hermeticDB.startDatabase({
      type: 'postgres',
      version: '15',
      port: 5433,
    });
  });

  afterAll(async () => {
    await hermeticDB.stopDatabase();
  });

  it('runs in complete isolation', async () => {
    // Database is completely isolated - no conflicts with other tests
    const db = hermeticDB.getClient();
    // ... your tests
  });
});
```

### AI-Powered Data Generation

```typescript
import { generateRealisticTestData, generateEdgeCaseTestData } from '@kitiumai/test-db/utils';

describe('User API with Realistic Data', () => {
  it('handles realistic user data', async () => {
    const userData = await generateRealisticTestData({
      table: 'users',
      count: 100,
      schema: {
        id: { type: 'integer' },
        name: { type: 'varchar', nullable: false },
        email: { type: 'varchar', nullable: false },
        age: { type: 'integer', nullable: true },
        created_at: { type: 'timestamp' },
      },
      patterns: {
        name: { type: 'realistic' },
        email: { type: 'realistic' },
      },
    });

    // userData.records contains 100 realistic user entries
    expect(userData.records).toHaveLength(100);
    expect(userData.metadata.aiEnhanced).toBe(true);
  });

  it('handles edge cases', async () => {
    const edgeCaseData = await generateEdgeCaseTestData({
      table: 'users',
      count: 10,
      schema: {
        name: { type: 'varchar', nullable: true, constraints: ['max_length:255'] },
        email: { type: 'varchar', nullable: false },
      },
    });

    // Test with null values, empty strings, max lengths, etc.
    // ... your edge case tests
  });
});
```

### Chaos Engineering

```typescript
import { DatabaseChaosOrchestrator } from '@kitiumai/test-db/utils';

describe('Resilient User Service', () => {
  let chaos: DatabaseChaosOrchestrator;

  beforeEach(() => {
    chaos = new DatabaseChaosOrchestrator(db);
  });

  it('handles connection failures', async () => {
    // Inject connection failure
    await chaos.injectFailure({
      type: 'connection_drop',
      duration: 5000, // 5 seconds
      probability: 1.0,
    });

    // Your service should handle this gracefully
    await expect(userService.getUser(1)).rejects.toThrow('Connection failed');
  });

  it('handles slow queries', async () => {
    // Inject latency
    await chaos.injectLatency({
      operation: 'SELECT',
      delay: 3000, // 3 second delay
      jitter: 500,
    });

    const start = Date.now();
    await userService.getUser(1);
    const duration = Date.now() - start;

    expect(duration).toBeGreaterThan(2500); // Allow for some jitter
  });
});
```

### Performance Benchmarking

```typescript
import { DatabaseBenchmarkSuite } from '@kitiumai/test-db/utils';

describe('Database Performance', () => {
  let benchmark: DatabaseBenchmarkSuite;

  beforeAll(() => {
    benchmark = new DatabaseBenchmarkSuite(db);
  });

  it('meets performance requirements', async () => {
    const results = await benchmark.runBenchmark({
      name: 'user_queries',
      operations: [
        {
          name: 'select_user_by_id',
          query: 'SELECT * FROM users WHERE id = $1',
          params: [1],
          iterations: 1000,
        },
        {
          name: 'select_users_paginated',
          query: 'SELECT * FROM users LIMIT $1 OFFSET $2',
          params: [50, 0],
          iterations: 500,
        },
      ],
    });

    // Assert performance requirements
    expect(results.operations[0].avgLatency).toBeLessThan(10); // < 10ms
    expect(results.operations[1].avgLatency).toBeLessThan(25); // < 25ms
    expect(results.throughput).toBeGreaterThan(100); // > 100 ops/sec
  });
});
```

### Advanced Observability

```typescript
import { AdvancedObservabilityManager, createDatabaseMetrics } from '@kitiumai/test-db/utils';

describe('Observable Database Operations', () => {
  let observability: AdvancedObservabilityManager;
  let metrics: ReturnType<typeof createDatabaseMetrics>;

  beforeAll(() => {
    observability = new AdvancedObservabilityManager({
      enableMetrics: true,
      enableTracing: true,
      enableLogging: true,
    });
    metrics = createDatabaseMetrics(observability);
  });

  it('tracks query performance', async () => {
    // Automatically track metrics
    metrics.recordQueryLatency(15.5, 'SELECT', 'users');
    metrics.recordConnectionPoolUsage(8, 20, 'users');

    const dashboard = await observability.getDashboardData();

    expect(dashboard.metrics.queryLatency).toContainEqual(
      expect.objectContaining({
        name: 'query.latency',
        value: 15.5,
        tags: { queryType: 'SELECT', database: 'users' },
      })
    );
  });
});
```

## Complete API Reference

### Core Database Clients

#### PostgreSQL
```typescript
import {
  createPostgresTestDB,
  PostgresTestDB,
  countRecords,
  createTable,
  deleteData,
  dropTable,
  fetchData,
  insertData,
  resetSequence,
  updateData,
} from '@kitiumai/test-db';
```

#### MongoDB
```typescript
import {
  createMongoDBTestDB,
  MongoDBTestDB,
  aggregate,
  clearCollection,
  countDocuments,
  createIndex,
  deleteDocuments,
  findDocuments,
  findOneDocument,
  insertDocuments,
  updateDocuments,
} from '@kitiumai/test-db';
```

### Configuration & Setup
```typescript
import {
  createMongoPreset,
  createPostgresPreset,
  createTestDbConfigBuilder,
  getMongoDBConfig,
  getPostgresConfig,
  sanitizeMongoDBConfig,
  sanitizePostgresConfig,
  TestDbConfigBuilder,
  TestEnvironmentPreset,
  validateMongoDBConfig,
  validatePostgresConfig,
} from '@kitiumai/test-db/utils/config';
```

### Test Frameworks Integration
```typescript
import {
  installMongoTestHarness,
  installPostgresTestHarness,
  createPostgresTransactionalHarness,
  withPerTestMongoDatabase,
  withWorkerPostgresDatabase,
} from '@kitiumai/test-db/utils/frameworks';
```

### Isolation & Lifecycle
```typescript
import {
  withTemporaryMongoDatabase,
  withTemporaryPostgresDatabase,
} from '@kitiumai/test-db/utils/lifecycle';
```

### Fixtures & Schema
```typescript
import {
  applyMongoFixtures,
  applySqlFixtures,
  snapshotTableSchema,
} from '@kitiumai/test-db/utils/fixtures';
```

### Hermetic Testing (Docker)
```typescript
import {
  DockerContainerManager,
  HermeticDatabaseManager,
} from '@kitiumai/test-db/utils/docker';
```

### Schema Migration Testing
```typescript
import {
  SchemaMigrationTester,
} from '@kitiumai/test-db/utils/schema';
```

### Chaos Engineering
```typescript
import {
  DatabaseChaosOrchestrator,
} from '@kitiumai/test-db/utils/chaos';
```

### Multi-Database Coordination
```typescript
import {
  MultiDatabaseCoordinator,
} from '@kitiumai/test-db/utils/coordination';
```

### Performance Benchmarking
```typescript
import {
  DatabaseBenchmarkSuite,
} from '@kitiumai/test-db/utils/benchmark';
```

### Cloud Integration
```typescript
import {
  CloudDatabaseManager,
  AWSRDSManager,
  GoogleCloudSQLManager,
  AzureDatabaseManager,
} from '@kitiumai/test-db/utils/cloud';
```

### AI-Powered Data Generation
```typescript
import {
  AIDataGenerator,
  generateRealisticTestData,
  generateEdgeCaseTestData,
  generatePerformanceTestData,
  generateRelationalTestData,
  learnDataPatterns,
} from '@kitiumai/test-db/utils/ai-data';
```

### Advanced Observability
```typescript
import {
  AdvancedObservabilityManager,
  createDatabaseMetrics,
  createDatabaseTracing,
  createDatabaseLogging,
  defaultAlertingRules,
} from '@kitiumai/test-db/utils/observability';
```

### Logging & Telemetry
```typescript
import {
  createLogger,
  withSpan,
} from '@kitiumai/test-db/utils';
```

## Advanced Examples

### End-to-End Testing with All Features

```typescript
import {
  HermeticDatabaseManager,
  AIDataGenerator,
  DatabaseChaosOrchestrator,
  AdvancedObservabilityManager,
  DatabaseBenchmarkSuite,
} from '@kitiumai/test-db/utils';

describe('Complete User Service Test Suite', () => {
  let hermeticDB: HermeticDatabaseManager;
  let aiGenerator: AIDataGenerator;
  let chaos: DatabaseChaosOrchestrator;
  let observability: AdvancedObservabilityManager;
  let benchmark: DatabaseBenchmarkSuite;

  beforeAll(async () => {
    // 1. Start hermetic database
    hermeticDB = new HermeticDatabaseManager(new DockerContainerManager());
    await hermeticDB.startDatabase({ type: 'postgres', version: '15' });

    // 2. Set up observability
    observability = new AdvancedObservabilityManager();
    observability.setupAlertingRules(defaultAlertingRules);

    // 3. Initialize AI data generator
    aiGenerator = new AIDataGenerator();

    // 4. Set up chaos engineering
    chaos = new DatabaseChaosOrchestrator(hermeticDB.getClient());

    // 5. Initialize benchmarking
    benchmark = new DatabaseBenchmarkSuite(hermeticDB.getClient());
  });

  describe('Happy Path Tests', () => {
    it('creates users with realistic data', async () => {
      const testData = await aiGenerator.generateRealisticTestData({
        table: 'users',
        count: 1000,
        schema: { /* schema definition */ },
      });

      // Insert test data and verify
      for (const user of testData.records) {
        await hermeticDB.getClient().query(/* insert query */);
      }

      const count = await hermeticDB.getClient().query('SELECT COUNT(*) FROM users');
      expect(parseInt(count.rows[0].count)).toBe(1000);
    });
  });

  describe('Resilience Tests', () => {
    it('handles database failures gracefully', async () => {
      // Inject chaos
      await chaos.injectFailure({
        type: 'connection_timeout',
        duration: 2000,
      });

      // Test service behavior during failure
      await expect(userService.createUser(testUser)).rejects.toThrow();
    });
  });

  describe('Performance Tests', () => {
    it('meets SLA requirements', async () => {
      const results = await benchmark.runBenchmark({
        name: 'user_operations',
        operations: [
          { name: 'create_user', /* ... */ },
          { name: 'get_user', /* ... */ },
          { name: 'update_user', /* ... */ },
        ],
      });

      expect(results.operations.every(op => op.avgLatency < 50)).toBe(true);
    });
  });

  afterAll(async () => {
    await hermeticDB.stopDatabase();
    observability.shutdown();
  });
});
```

### Multi-Region Cloud Testing

```typescript
import { CloudDatabaseManager } from '@kitiumai/test-db/utils';

describe('Multi-Region User Service', () => {
  let primaryDB: CloudDatabaseManager;
  let replicaDB: CloudDatabaseManager;

  beforeAll(async () => {
    // Primary in us-east-1
    primaryDB = new CloudDatabaseManager({
      provider: 'aws',
      region: 'us-east-1',
      instance: 'primary-db',
    });

    // Read replica in us-west-2
    replicaDB = new CloudDatabaseManager({
      provider: 'aws',
      region: 'us-west-2',
      instance: 'replica-db',
    });

    await Promise.all([
      primaryDB.connect(),
      replicaDB.connect(),
    ]);
  });

  it('replicates data across regions', async () => {
    // Write to primary
    await primaryDB.execute('INSERT INTO users (name) VALUES ($1)', ['John']);

    // Wait for replication (in real scenario)
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Read from replica
    const result = await replicaDB.query('SELECT * FROM users WHERE name = $1', ['John']);
    expect(result.rows).toHaveLength(1);
  });
});
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](../CONTRIBUTING.md) for details.

## License

MIT © [KitiumAI](https://github.com/kitium-ai)
