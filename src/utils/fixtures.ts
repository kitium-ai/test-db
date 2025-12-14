import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { MongoDBTestDB } from '../mongodb/client.js';
import { getCollection } from '../mongodb/collection.js';
import type { PostgresTestDB } from '../postgres/client.js';
import { addErrorToMeta } from './errors.js';
import { createLogger } from './logging.js';
import { withSpan } from './telemetry.js';

const logger = createLogger('TestDB:Fixtures');

const readSqlFixtureFile = (absolutePath: string): Promise<string> => {
  // Fixtures are explicitly provided by the caller; this is expected in test utilities.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return readFile(absolutePath, 'utf-8');
};

const applySqlStatements = async (
  database: PostgresTestDB,
  statements: string[],
  absolutePath: string,
  options?: SqlFixtureOptions
): Promise<void> => {
  for (const statement of statements) {
    try {
      await withSpan('postgres.fixture.apply', () => database.query(statement), {
        fixturePath: absolutePath,
      });
    } catch (error) {
      logger.error(
        'Failed to apply SQL fixture',
        addErrorToMeta({ fixturePath: absolutePath }, error)
      );
      if (options?.stopOnError) {
        throw error;
      }
    }
  }
};

export type SqlFixtureOptions = {
  stopOnError?: boolean;
};

export const applySqlFixtures = async (
  database: PostgresTestDB,
  fixturePaths: string[],
  options?: SqlFixtureOptions
): Promise<void> => {
  for (const fixturePath of fixturePaths) {
    const absolutePath = path.resolve(fixturePath);
    const sql = await readSqlFixtureFile(absolutePath);
    const statements = sql
      .split(/;\s*\n/)
      .map((stmt) => stmt.trim())
      .filter(Boolean);
    await applySqlStatements(database, statements, absolutePath, options);
  }
};

export type MongoFixtureDocument = {
  collection: string;
  documents: Array<Record<string, unknown>>;
};

export const applyMongoFixtures = async (
  database: MongoDBTestDB,
  fixtures: MongoFixtureDocument[]
): Promise<void> => {
  for (const fixture of fixtures) {
    await withSpan(
      'mongodb.fixture.apply',
      async () => {
        const collection = await getCollection(database, fixture.collection);
        if (fixture.documents.length) {
          await collection.insertMany(fixture.documents);
        }
      },
      { collection: fixture.collection }
    );
  }
};

export const snapshotTableSchema = async (
  database: PostgresTestDB,
  table: string
): Promise<Array<Record<string, unknown>>> => {
  const sql = `SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = $1
    ORDER BY ordinal_position`;
  const result = await database.query(sql, [table]);
  return (result as { rows: Array<Record<string, unknown>> }).rows;
};
