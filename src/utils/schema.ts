/**
 * Schema migration testing utilities
 */

import { promises as fs } from 'fs';
import path from 'path';

import { MongoDBTestDB } from '../mongodb/client.js';
import { PostgresTestDB } from '../postgres/client.js';
import { createLogger, type ILogger } from './logging.js';
import { withSpan } from './telemetry.js';

export interface SchemaDefinition {
  tables?: Record<string, TableSchema>;
  collections?: Record<string, CollectionSchema>;
  indexes?: Record<string, IndexDefinition>;
  constraints?: Record<string, ConstraintDefinition>;
}

export interface TableSchema {
  columns: Record<string, ColumnDefinition>;
  primaryKey?: string[];
  indexes?: IndexDefinition[];
  constraints?: ConstraintDefinition[];
}

export interface ColumnDefinition {
  type: string;
  nullable?: boolean;
  default?: string;
  references?: {
    table: string;
    column: string;
  };
}

export interface CollectionSchema {
  validator?: Record<string, unknown>;
  indexes?: IndexDefinition[];
}

export interface IndexDefinition {
  columns?: string[];
  keys?: Record<string, 1 | -1>;
  unique?: boolean;
  name?: string;
}

export interface ConstraintDefinition {
  type: 'unique' | 'check' | 'foreign_key';
  columns?: string[];
  expression?: string;
  references?: {
    table: string;
    columns: string[];
  };
}

export interface MigrationStep {
  version: string;
  description: string;
  up: (db: PostgresTestDB | MongoDBTestDB) => Promise<void>;
  down: (db: PostgresTestDB | MongoDBTestDB) => Promise<void>;
}

export interface MigrationResult {
  version: string;
  success: boolean;
  duration: number;
  error?: string;
}

export class SchemaMigrationTester {
  private readonly logger: ILogger;

  constructor() {
    this.logger = createLogger('SchemaMigrationTester');
    // fs and path modules are available for future file-based migration features
    void fs; // Mark as available but not yet used
    void path; // Mark as available but not yet used
  }

  /**
   * Validate schema against current database state
   */
  public async validateSchema(
    database: PostgresTestDB | MongoDBTestDB,
    expectedSchema: SchemaDefinition
  ): Promise<{
    isValid: boolean;
    differences: string[];
    recommendations: string[];
  }> {
    return withSpan('schema.validate', async () => {
      if (database instanceof PostgresTestDB) {
        return this.validatePostgresSchema(database, expectedSchema);
      } else if (database instanceof MongoDBTestDB) {
        return this.validateMongoSchema(database, expectedSchema);
      }

      throw new Error('Unsupported database type');
    });
  }

  private async validatePostgresSchema(
    database: PostgresTestDB,
    expectedSchema: SchemaDefinition
  ): Promise<{
    isValid: boolean;
    differences: string[];
    recommendations: string[];
  }> {
    const differences: string[] = [];
    const recommendations: string[] = [];

    if (!expectedSchema.tables) {
      return { isValid: true, differences, recommendations };
    }

    // Get current schema information
    const currentTables = await this.getPostgresTables(database);

    // Validate tables exist
    for (const [tableName, expectedTable] of Object.entries(expectedSchema.tables)) {
      if (!currentTables[tableName]) {
        differences.push(`Missing table: ${tableName}`);
        recommendations.push(
          `Create table ${tableName} with schema: ${JSON.stringify(expectedTable)}`
        );
        continue;
      }

      // Validate columns
      const currentColumns = currentTables[tableName].columns;
      for (const [columnName, expectedColumn] of Object.entries(expectedTable.columns)) {
        if (!currentColumns[columnName]) {
          differences.push(`Missing column ${columnName} in table ${tableName}`);
          recommendations.push(`Add column ${columnName} to table ${tableName}`);
          continue;
        }

        const currentColumn = currentColumns[columnName];
        if (currentColumn.type !== expectedColumn.type) {
          differences.push(
            `Column ${columnName} in table ${tableName} has type ${currentColumn.type}, expected ${expectedColumn.type}`
          );
        }
        if (currentColumn.nullable !== expectedColumn.nullable) {
          differences.push(
            `Column ${columnName} in table ${tableName} nullable: ${currentColumn.nullable}, expected ${expectedColumn.nullable}`
          );
        }
      }
    }

    return {
      isValid: differences.length === 0,
      differences,
      recommendations,
    };
  }

  private async validateMongoSchema(
    database: MongoDBTestDB,
    expectedSchema: SchemaDefinition
  ): Promise<{
    isValid: boolean;
    differences: string[];
    recommendations: string[];
  }> {
    const differences: string[] = [];
    const recommendations: string[] = [];

    if (!expectedSchema.collections) {
      return { isValid: true, differences, recommendations };
    }

    // Get current collections
    const currentCollections = await this.getMongoCollections(database);

    // Validate collections exist
    for (const [collectionName, expectedCollection] of Object.entries(expectedSchema.collections)) {
      if (!currentCollections[collectionName]) {
        differences.push(`Missing collection: ${collectionName}`);
        recommendations.push(`Create collection ${collectionName}`);
        continue;
      }

      // Validate indexes
      if (expectedCollection.indexes) {
        const currentIndexes = currentCollections[collectionName].indexes || [];
        for (const expectedIndex of expectedCollection.indexes) {
          const indexExists = currentIndexes.some((currentIndex) =>
            this.compareIndexes(currentIndex, expectedIndex)
          );
          if (!indexExists) {
            differences.push(
              `Missing index on collection ${collectionName}: ${JSON.stringify(expectedIndex)}`
            );
            recommendations.push(`Create index on collection ${collectionName}`);
          }
        }
      }
    }

    return {
      isValid: differences.length === 0,
      differences,
      recommendations,
    };
  }

  /**
   * Run migration steps and measure performance
   */
  public async testMigrations(
    database: PostgresTestDB | MongoDBTestDB,
    migrations: MigrationStep[]
  ): Promise<{
    results: MigrationResult[];
    totalDuration: number;
    rollbackResults: MigrationResult[];
  }> {
    return withSpan('migration.test', async () => {
      const results: MigrationResult[] = [];
      const rollbackResults: MigrationResult[] = [];
      let totalDuration = 0;

      // Run migrations up
      for (const migration of migrations) {
        const startTime = Date.now();
        try {
          await migration.up(database);
          const duration = Date.now() - startTime;
          results.push({
            version: migration.version,
            success: true,
            duration,
          });
          totalDuration += duration;
          this.logger.info('Migration up successful', { version: migration.version, duration });
        } catch (error) {
          const duration = Date.now() - startTime;
          const error_ = error instanceof Error ? error : new Error(String(error));
          results.push({
            version: migration.version,
            success: false,
            duration,
            error: error_.message,
          });
          this.logger.error('Migration up failed', {
            version: migration.version,
            error: error_.message,
          });
          break;
        }
      }

      // Run migrations down in reverse order
      for (const migration of migrations.slice().reverse()) {
        const startTime = Date.now();
        try {
          await migration.down(database);
          const duration = Date.now() - startTime;
          rollbackResults.push({
            version: migration.version,
            success: true,
            duration,
          });
          this.logger.info('Migration down successful', { version: migration.version, duration });
        } catch (error) {
          const duration = Date.now() - startTime;
          const error_ = error instanceof Error ? error : new Error(String(error));
          rollbackResults.push({
            version: migration.version,
            success: false,
            duration,
            error: error_.message,
          });
          this.logger.error('Migration down failed', {
            version: migration.version,
            error: error_.message,
          });
        }
      }

      return {
        results,
        totalDuration,
        rollbackResults,
      };
    });
  }

  /**
   * Detect schema drift between environments
   */
  public async detectSchemaDrift(
    sourceDb: PostgresTestDB | MongoDBTestDB,
    targetDb: PostgresTestDB | MongoDBTestDB,
    schema: SchemaDefinition
  ): Promise<{
    hasDrift: boolean;
    sourceDifferences: string[];
    targetDifferences: string[];
  }> {
    const [sourceValidation, targetValidation] = await Promise.all([
      this.validateSchema(sourceDb, schema),
      this.validateSchema(targetDb, schema),
    ]);

    return {
      hasDrift: !sourceValidation.isValid || !targetValidation.isValid,
      sourceDifferences: sourceValidation.differences,
      targetDifferences: targetValidation.differences,
    };
  }

  /**
   * Generate migration from schema differences
   */
  public generateMigration(
    currentSchema: SchemaDefinition,
    targetSchema: SchemaDefinition
  ): MigrationStep[] {
    const migrations: MigrationStep[] = [];

    // Generate table/collection creation migrations
    if (targetSchema.tables) {
      for (const [tableName, tableSchema] of Object.entries(targetSchema.tables)) {
        if (!currentSchema.tables?.[tableName]) {
          migrations.push({
            version: `create_table_${tableName}_${Date.now()}`,
            description: `Create table ${tableName}`,
            up: async (db) => {
              if (db instanceof PostgresTestDB) {
                const columns = Object.entries(tableSchema.columns)
                  .map(
                    ([col, def]) =>
                      `${col} ${def.type}${def.nullable === false ? ' NOT NULL' : ''}${def.default ? ` DEFAULT ${def.default}` : ''}`
                  )
                  .join(', ');
                const primaryKey = tableSchema.primaryKey
                  ? `, PRIMARY KEY (${tableSchema.primaryKey.join(', ')})`
                  : '';
                await db.query(`CREATE TABLE ${tableName} (${columns}${primaryKey})`);
              }
            },
            down: async (db) => {
              if (db instanceof PostgresTestDB) {
                await db.query(`DROP TABLE IF EXISTS ${tableName}`);
              }
            },
          });
        }
      }
    }

    return migrations;
  }

  private async getPostgresTables(
    database: PostgresTestDB
  ): Promise<Record<string, { columns: Record<string, { type: string; nullable: boolean }> }>> {
    const result = await database.query(`
      SELECT
        t.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable
      FROM information_schema.tables t
      JOIN information_schema.columns c ON t.table_name = c.table_name
      WHERE t.table_schema = 'public'
      ORDER BY t.table_name, c.ordinal_position
    `);

    const tables: Record<string, { columns: Record<string, { type: string; nullable: boolean }> }> =
      {};

    for (const row of result.rows) {
      const tableName = row.table_name as string;
      const columnName = row.column_name as string;
      const type = row.data_type as string;
      const nullable = row.is_nullable === 'YES';

      if (!tables[tableName]) {
        tables[tableName] = { columns: {} };
      }
      tables[tableName].columns[columnName] = { type, nullable };
    }

    return tables;
  }

  private async getMongoCollections(
    database: MongoDBTestDB
  ): Promise<Record<string, { indexes: IndexDefinition[] }>> {
    // This is a simplified implementation - in practice, you'd query MongoDB system collections
    this.logger.debug('Getting MongoDB collections', { database: database.constructor.name });
    const collections: Record<string, { indexes: IndexDefinition[] }> = {};
    // Implementation would query system.indexes collection
    return collections;
  }

  private compareIndexes(index1: IndexDefinition, index2: IndexDefinition): boolean {
    // Simplified index comparison
    return JSON.stringify(index1) === JSON.stringify(index2);
  }
}

// Convenience functions
export const validateDatabaseSchema = (
  database: PostgresTestDB | MongoDBTestDB,
  schema: SchemaDefinition
): Promise<{
  isValid: boolean;
  differences: string[];
  recommendations: string[];
}> => {
  const tester = new SchemaMigrationTester();
  return tester.validateSchema(database, schema);
};

export const testDatabaseMigrations = (
  database: PostgresTestDB | MongoDBTestDB,
  migrations: MigrationStep[]
): Promise<{
  results: MigrationResult[];
  totalDuration: number;
  rollbackResults: MigrationResult[];
}> => {
  const tester = new SchemaMigrationTester();
  return tester.testMigrations(database, migrations);
};

export const detectSchemaDrift = (
  sourceDb: PostgresTestDB | MongoDBTestDB,
  targetDb: PostgresTestDB | MongoDBTestDB,
  schema: SchemaDefinition
): Promise<{
  hasDrift: boolean;
  sourceDifferences: string[];
  targetDifferences: string[];
}> => {
  const tester = new SchemaMigrationTester();
  return tester.detectSchemaDrift(sourceDb, targetDb, schema);
};

export const generateSchemaMigration = (
  currentSchema: SchemaDefinition,
  targetSchema: SchemaDefinition
): MigrationStep[] => {
  const tester = new SchemaMigrationTester();
  return tester.generateMigration(currentSchema, targetSchema);
};
