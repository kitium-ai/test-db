import {
  createMongoPreset,
  createPostgresPreset,
  createTestDbConfigBuilder as createTestDatabaseConfigBuilder,
} from '../src/utils/config.js';

describe('Test DB config builder', () => {
  beforeEach(() => {
    process.env.POSTGRES_HOST = 'localhost';
    process.env.POSTGRES_USER = 'postgres';
    process.env.POSTGRES_PASSWORD = 'postgres';
    process.env.POSTGRES_DB = 'test_db';
    process.env.MONGO_HOST = 'localhost';
    process.env.MONGO_USER = 'root';
    process.env.MONGO_PASSWORD = 'root';
    process.env.MONGO_DB = 'test_db';
  });

  it('creates ci preset for postgres', () => {
    const config = createPostgresPreset('ci');
    expect(config.host).toBe('postgres');
  });

  it('creates staging preset for mongo', () => {
    process.env.STAGING_MONGO_URI = 'mongodb://mongo-staging:27017';
    const config = createMongoPreset('staging');
    expect(config.uri).toContain('mongo-staging');
  });

  it('builder merges overrides for postgres', () => {
    const builder = createTestDatabaseConfigBuilder('local').withPostgres({
      database: 'custom_db',
    });
    const config = builder.buildPostgres();
    expect(config.database).toBe('custom_db');
  });

  it('builder merges overrides for mongo', () => {
    const builder = createTestDatabaseConfigBuilder('ci').withMongo({ database: 'temp_db' });
    const config = builder.buildMongo();
    expect(config.database).toBe('temp_db');
  });
});
