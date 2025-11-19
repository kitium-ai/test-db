# @kitium-ai/test-db

Enterprise-ready test database utilities for PostgreSQL and MongoDB. Provides reusable test setup and methods to support testing databases with simplicity, ease of use, and security in mind.

## Features

- ✅ **PostgreSQL Support** - Connection pooling, transactions, data manipulation
- ✅ **MongoDB Support** - Document operations, transactions, aggregations
- ✅ **Type-Safe** - Full TypeScript support with strict type checking
- ✅ **Connection Management** - Automatic pooling and connection lifecycle
- ✅ **Transaction Support** - ACID compliance for both databases
- ✅ **Data Seeding** - Easy database initialization for tests
- ✅ **Error Handling** - Comprehensive error handling and logging
- ✅ **Security** - Sanitized logging, parameter binding, input validation
- ✅ **Enterprise Ready** - Production-grade code quality and testing

## Installation

```bash
npm install @kitium-ai/test-db
# or
yarn add @kitium-ai/test-db
# or
pnpm add @kitium-ai/test-db
```

## Quick Start

### PostgreSQL

```typescript
import { createPostgresTestDB } from '@kitium-ai/test-db';

async function example() {
  const db = createPostgresTestDB({
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: 'password',
    database: 'test_db',
  });

  await db.connect();

  // Execute queries
  const result = await db.query('SELECT * FROM users');
  console.log(result.rows);

  await db.disconnect();
}
```

### MongoDB

```typescript
import { createMongoDBTestDB } from '@kitium-ai/test-db';

async function example() {
  const db = createMongoDBTestDB({
    uri: 'mongodb://localhost:27017',
    database: 'test_db',
  });

  await db.connect();

  // Insert documents
  const collection = await db.collection('users');
  await collection.insertOne({ name: 'John Doe', email: 'john@example.com' });

  await db.disconnect();
}
```

## PostgreSQL API

### Creating a Test Database

```typescript
import { createPostgresTestDB } from '@kitium-ai/test-db';

const db = createPostgresTestDB({
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'password',
  database: 'test_db',
  ssl: false,
  connectionTimeout: 5000,
  maxConnections: 20,
});
```

### Connection Management

```typescript
// Connect
await db.connect();

// Check connection status
if (db.isConnected()) {
  console.log('Connected');
}

// Disconnect
await db.disconnect();
```

### Executing Queries

```typescript
// Execute a query
const result = await db.query('SELECT * FROM users WHERE id = $1', [1]);
console.log(result.rows);

// Execute and get first result
const user = await db.execute('SELECT * FROM users WHERE id = $1', [1]);
```

### Working with Tables

```typescript
import { createTable, dropTable, insertData, fetchData } from '@kitium-ai/test-db';

// Create table
await createTable(
  db,
  'users',
  `(
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE
  )`
);

// Insert data
await insertData(db, 'users', [
  { name: 'John Doe', email: 'john@example.com' },
  { name: 'Jane Smith', email: 'jane@example.com' },
]);

// Fetch data
const users = await fetchData(db, 'users');
const filtered = await fetchData(db, 'users', { name: 'John Doe' });

// Count records
const count = await countRecords(db, 'users');

// Update data
await updateData(db, 'users', { age: 31 }, { name: 'John Doe' });

// Delete data
await deleteData(db, 'users', { name: 'John Doe' });

// Drop table
await dropTable(db, 'users');
```

### Transactions

```typescript
await db.transaction(async (client) => {
  await client.query('INSERT INTO users (name, email) VALUES ($1, $2)', [
    'John Doe',
    'john@example.com',
  ]);

  await client.query('UPDATE users SET active = true WHERE name = $1', ['John Doe']);

  // If any error occurs, transaction is rolled back automatically
});
```

### Database Operations

```typescript
// Create database
await db.createDatabase('new_test_db');

// Drop database
await db.dropDatabase('new_test_db');

// Truncate tables
await db.truncateTables(['users', 'posts']);

// Seed database
await db.seed({
  users: [
    { name: 'User 1', email: 'user1@example.com' },
    { name: 'User 2', email: 'user2@example.com' },
  ],
  posts: [
    { title: 'Post 1', author_id: 1 },
    { title: 'Post 2', author_id: 2 },
  ],
});
```

## MongoDB API

### Creating a Test Database

```typescript
import { createMongoDBTestDB } from '@kitium-ai/test-db';

const db = createMongoDBTestDB({
  uri: 'mongodb://localhost:27017',
  database: 'test_db',
  connectionTimeout: 5000,
  serverSelectionTimeout: 5000,
});
```

### Connection Management

```typescript
// Connect
await db.connect();

// Check connection status
if (db.isConnected()) {
  console.log('Connected');
}

// Disconnect
await db.disconnect();
```

### Working with Collections

```typescript
import {
  insertDocuments,
  findDocuments,
  updateDocuments,
  deleteDocuments,
  countDocuments,
  clearCollection,
} from '@kitium-ai/test-db';

// Insert documents
await insertDocuments(db, 'users', [
  { name: 'John Doe', email: 'john@example.com', age: 30 },
  { name: 'Jane Smith', email: 'jane@example.com', age: 28 },
]);

// Find documents
const allUsers = await findDocuments(db, 'users');
const filtered = await findDocuments(db, 'users', { age: { $gt: 25 } });

// Update documents
await updateDocuments(db, 'users', { name: 'John Doe' }, { age: 31 });

// Delete documents
await deleteDocuments(db, 'users', { name: 'John Doe' });

// Count documents
const count = await countDocuments(db, 'users');

// Clear entire collection
await clearCollection(db, 'users');
```

### Transactions

```typescript
await db.transaction(async (session) => {
  const collection = await db.collection('users');
  await collection.insertOne({ name: 'John Doe' }, { session });

  // If any error occurs, transaction is rolled back automatically
});
```

### Advanced Operations

```typescript
import { createIndex, aggregate } from '@kitium-ai/test-db';

// Create index
await createIndex(db, 'users', { email: 1 }, { unique: true });

// Aggregation pipeline
const results = await aggregate(db, 'users', [
  { $match: { age: { $gt: 25 } } },
  { $group: { _id: null, avgAge: { $avg: '$age' } } },
]);

// Drop collection
await db.dropCollection('users');

// Drop entire database
await db.dropDatabase();
```

### Database Seeding

```typescript
await db.seed({
  users: [
    { name: 'User 1', email: 'user1@example.com', role: 'admin' },
    { name: 'User 2', email: 'user2@example.com', role: 'user' },
  ],
  posts: [
    { title: 'Post 1', content: 'Content 1', author_id: 1 },
    { title: 'Post 2', content: 'Content 2', author_id: 2 },
  ],
});
```

## Environment Variables

### PostgreSQL

```bash
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=test_db
POSTGRES_SSL=false
POSTGRES_CONNECTION_TIMEOUT=5000
POSTGRES_IDLE_TIMEOUT=30000
POSTGRES_MAX_CONNECTIONS=20
```

### MongoDB

```bash
MONGO_URI=mongodb://localhost:27017
MONGO_USER=root
MONGO_PASSWORD=root
MONGO_HOST=localhost
MONGO_PORT=27017
MONGO_DB=test_db
MONGO_CONNECTION_TIMEOUT=5000
MONGO_SERVER_SELECTION_TIMEOUT=5000
```

### General

```bash
DEBUG=true  # Enable debug logging
```

## Configuration

Both PostgreSQL and MongoDB support configuration from environment variables or programmatic config:

```typescript
import {
  getPostgresConfig,
  getMongoDBConfig,
  validatePostgresConfig,
  sanitizePostgresConfig,
} from '@kitium-ai/test-db';

// Get from environment
const pgConfig = getPostgresConfig();
const mongoConfig = getMongoDBConfig();

// Override specific values
const customConfig = getPostgresConfig({
  host: 'prod-db.example.com',
  port: 5433,
});

// Validate configuration
if (validatePostgresConfig(pgConfig)) {
  console.log('Valid configuration');
}

// Sanitize for logging (removes sensitive data)
const sanitized = sanitizePostgresConfig(pgConfig);
console.log(sanitized); // Doesn't include password
```

## Testing Examples

### Jest Setup with PostgreSQL

```typescript
// jest.setup.ts
import { setupPostgresTestDatabase, teardownPostgresTestDatabase } from '@kitium-ai/test-db';

let testDB: any;

beforeAll(async () => {
  testDB = await setupPostgresTestDatabase(
    { database: 'test_db_jest' },
    {
      users: '(id SERIAL PRIMARY KEY, name VARCHAR(255), email VARCHAR(255))',
      posts: '(id SERIAL PRIMARY KEY, title VARCHAR(255), user_id INT)',
    }
  );
});

afterAll(async () => {
  await teardownTestDatabase(testDB, ['users', 'posts']);
});
```

### Jest Setup with MongoDB

```typescript
// jest.setup.ts
import { setupMongoDBTestDatabase, teardownMongoDBTestDatabase } from '@kitium-ai/test-db';

let testDB: any;

beforeAll(async () => {
  testDB = await setupMongoDBTestDatabase(
    { database: 'test_db_jest' },
    ['users', 'posts']
  );
});

afterAll(async () => {
  await teardownMongoDBTestDatabase(testDB, ['users', 'posts']);
});
```

## Error Handling

The package provides comprehensive error handling:

```typescript
import { createPostgresTestDB } from '@kitium-ai/test-db';

try {
  const db = createPostgresTestDB({ /* config */ });
  await db.connect();

  // Your database operations
} catch (error) {
  if (error instanceof Error) {
    console.error('Database error:', error.message);
  }
} finally {
  await db.disconnect();
}
```

## Security Features

- ✅ **SQL Injection Prevention** - Parameterized queries
- ✅ **Sensitive Data Protection** - Password masking in logs
- ✅ **Input Validation** - Database name validation
- ✅ **Connection Security** - SSL/TLS support for PostgreSQL
- ✅ **Transaction Safety** - Automatic rollback on errors

## Performance Considerations

- Connection pooling with configurable pool size
- Connection reuse for better performance
- Batch operations for data insertion
- Index support for MongoDB queries

## Logging

Debug logging can be enabled via environment variable:

```bash
DEBUG=true npm test
```

All database operations will be logged with timestamps and context information.

## TypeScript Support

Full TypeScript support with strict type checking:

```typescript
import {
  PostgresTestDB,
  MongoDBTestDB,
  PostgresConfig,
  MongoDBConfig,
} from '@kitium-ai/test-db';

const pgDB: PostgresTestDB = createPostgresTestDB(pgConfig);
const mongoDBClient: MongoDBTestDB = createMongoDBTestDB(mongoConfig);
```

## Contributing

Contributions are welcome! Please ensure:

- All tests pass
- Code is properly formatted
- TypeScript compilation succeeds
- ESLint checks pass

```bash
npm run build
npm run lint
npm test
```

## License

MIT

## Support

For issues and questions:

- 📧 Create an issue on GitHub
- 📚 Check the documentation
- 🐛 Report bugs with reproduction steps

## Changelog

### v1.0.0 (Initial Release)

- PostgreSQL test database utilities
- MongoDB test database utilities
- Connection management and pooling
- Transaction support
- Data seeding capabilities
- Comprehensive type definitions
- Full test coverage
- Production-ready error handling
