/**
 * Schema migration testing utilities
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { MongoDBTestDB } from '../mongodb/client.js';
import { PostgresTestDB } from '../postgres/client.js';
import { createLogger, type ILogger } from './logging.js';
import { withSpan } from './telemetry.js';

export type SchemaDefinition = {
  tables?: Record<string, TableSchema>;
  collections?: Record<string, CollectionSchema>;
  indexes?: Record<string, IndexDefinition>;
  constraints?: Record<string, ConstraintDefinition>;
};

export type TableSchema = {
  columns: Record<string, ColumnDefinition>;
  primaryKey?: string[];
  indexes?: IndexDefinition[];
  constraints?: ConstraintDefinition[];
};

export type ColumnDefinition = {
  type: string;
  nullable?: boolean;
  default?: string;
  references?: {
    table: string;
    column: string;
  };
};

export type CollectionSchema = {
  validator?: Record<string, unknown>;
  indexes?: IndexDefinition[];
};

export type IndexDefinition = {
  columns?: string[];
  keys?: Record<string, 1 | -1>;
  unique?: boolean;
  name?: string;
};

export type ConstraintDefinition = {
  type: 'unique' | 'check' | 'foreign_key';
  columns?: string[];
  expression?: string;
  references?: {
    table: string;
    columns: string[];
  };
};

export type MigrationStep = {
  version: string;
  description: string;
  up: (database: PostgresTestDB | MongoDBTestDB) => Promise<void>;
  down: (database: PostgresTestDB | MongoDBTestDB) => Promise<void>;
};

export type MigrationResult = {
  version: string;
  success: boolean;
  duration: number;
  error?: string;
};

function formatColumnDefinition(columnName: string, definition: ColumnDefinition): string {
  const notNullClause = definition.nullable === false ? ' NOT NULL' : '';
  const defaultClause = definition.default ? ` DEFAULT ${definition.default}` : '';
  return `${columnName} ${definition.type}${notNullClause}${defaultClause}`;
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
  public validateSchema(
    database: PostgresTestDB | MongoDBTestDB,
    expectedSchema: SchemaDefinition
  ): Promise<{
    isValid: boolean;
    differences: string[];
    recommendations: string[];
  }> {
    return withSpan('schema.validate', () => {
      if (database instanceof PostgresTestDB) {
        return this.validatePostgresSchema(database, expectedSchema);
      }
      if (database instanceof MongoDBTestDB) {
        return this.validateMongoSchema(database, expectedSchema);
      }
      return Promise.reject(new Error('Unsupported database type'));
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
      const currentTable = currentTables[tableName];
      this.validatePostgresTableSchema(
        tableName,
        expectedTable,
        currentTable,
        differences,
        recommendations
      );
    }

    return {
      isValid: differences.length === 0,
      differences,
      recommendations,
    };
  }

  private validatePostgresTableSchema(
    tableName: string,
    expectedTable: TableSchema,
    currentTable:
      | {
          columns: Record<string, { type: string; nullable: boolean }>;
        }
      | undefined,
    differences: string[],
    recommendations: string[]
  ): void {
    if (!currentTable) {
      differences.push(`Missing table: ${tableName}`);
      recommendations.push(
        `Create table ${tableName} with schema: ${JSON.stringify(expectedTable)}`
      );
      return;
    }

    const currentColumns = currentTable.columns;
    for (const [columnName, expectedColumn] of Object.entries(expectedTable.columns)) {
      const currentColumn = currentColumns[columnName];
      if (!currentColumn) {
        differences.push(`Missing column ${columnName} in table ${tableName}`);
        recommendations.push(`Add column ${columnName} to table ${tableName}`);
        continue;
      }

      this.validatePostgresColumn(
        tableName,
        columnName,
        currentColumn,
        expectedColumn,
        differences
      );
    }
  }

  private validatePostgresColumn(
    tableName: string,
    columnName: string,
    currentColumn: { type: string; nullable: boolean },
    expectedColumn: ColumnDefinition,
    differences: string[]
  ): void {
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
        this.validateMongoIndexes(
          collectionName,
          expectedCollection.indexes,
          currentIndexes,
          differences,
          recommendations
        );
      }
    }

    return {
      isValid: differences.length === 0,
      differences,
      recommendations,
    };
  }

  private validateMongoIndexes(
    collectionName: string,
    expectedIndexes: IndexDefinition[],
    currentIndexes: IndexDefinition[],
    differences: string[],
    recommendations: string[]
  ): void {
    for (const expectedIndex of expectedIndexes) {
      const hasIndex = currentIndexes.some((currentIndex) =>
        this.compareIndexes(currentIndex, expectedIndex)
      );
      if (!hasIndex) {
        differences.push(
          `Missing index on collection ${collectionName}: ${JSON.stringify(expectedIndex)}`
        );
        recommendations.push(`Create index on collection ${collectionName}`);
      }
    }
  }

  /**
   * Run migration steps and measure performance
   */
  public testMigrations(
    database: PostgresTestDB | MongoDBTestDB,
    migrations: MigrationStep[]
  ): Promise<{
    results: MigrationResult[];
    totalDuration: number;
    rollbackResults: MigrationResult[];
  }> {
    return withSpan('migration.test', () => this.runMigrationTest(database, migrations));
  }

  private async runMigrationTest(
    database: PostgresTestDB | MongoDBTestDB,
    migrations: MigrationStep[]
  ): Promise<{
    results: MigrationResult[];
    totalDuration: number;
    rollbackResults: MigrationResult[];
  }> {
    const { results, totalDuration, completedMigrations } = await this.runMigrationsUp(
      database,
      migrations
    );
    const rollbackResults = await this.runMigrationsDown(database, completedMigrations);
    return { results, totalDuration, rollbackResults };
  }

  private async runMigrationsUp(
    database: PostgresTestDB | MongoDBTestDB,
    migrations: MigrationStep[]
  ): Promise<{
    results: MigrationResult[];
    totalDuration: number;
    completedMigrations: MigrationStep[];
  }> {
    const results: MigrationResult[] = [];
    const completedMigrations: MigrationStep[] = [];
    let totalDuration = 0;

    for (const migration of migrations) {
      const outcome = await this.runSingleMigration(database, migration, 'up');
      results.push(outcome.result);
      totalDuration += outcome.result.duration;
      if (!outcome.result.success) {
        break;
      }
      completedMigrations.push(migration);
    }

    return { results, totalDuration, completedMigrations };
  }

  private async runMigrationsDown(
    database: PostgresTestDB | MongoDBTestDB,
    migrations: MigrationStep[]
  ): Promise<MigrationResult[]> {
    const rollbackResults: MigrationResult[] = [];
    for (const migration of [...migrations].reverse()) {
      const outcome = await this.runSingleMigration(database, migration, 'down');
      rollbackResults.push(outcome.result);
    }
    return rollbackResults;
  }

  private async runSingleMigration(
    database: PostgresTestDB | MongoDBTestDB,
    migration: MigrationStep,
    direction: 'up' | 'down'
  ): Promise<{ result: MigrationResult }> {
    const startTime = Date.now();
    try {
      if (direction === 'up') {
        await migration.up(database);
      } else {
        await migration.down(database);
      }
      const duration = Date.now() - startTime;
      this.logger.info(`Migration ${direction} successful`, {
        version: migration.version,
        duration,
      });
      return { result: { version: migration.version, success: true, duration } };
    } catch (error) {
      const duration = Date.now() - startTime;
      const error_ = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Migration ${direction} failed`, {
        version: migration.version,
        error: error_.message,
      });
      return {
        result: { version: migration.version, success: false, duration, error: error_.message },
      };
    }
  }

  /**
   * Detect schema drift between environments
   */
  public async detectSchemaDrift(
    sourceDatabase: PostgresTestDB | MongoDBTestDB,
    targetDatabase: PostgresTestDB | MongoDBTestDB,
    schema: SchemaDefinition
  ): Promise<{
    hasDrift: boolean;
    sourceDifferences: string[];
    targetDifferences: string[];
  }> {
    const [sourceValidation, targetValidation] = await Promise.all([
      this.validateSchema(sourceDatabase, schema),
      this.validateSchema(targetDatabase, schema),
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
            up: async (database) => {
              if (database instanceof PostgresTestDB) {
                const columns = Object.entries(tableSchema.columns)
                  .map(([col, definition]) => formatColumnDefinition(col, definition))
                  .join(', ');
                const primaryKey = tableSchema.primaryKey
                  ? `, PRIMARY KEY (${tableSchema.primaryKey.join(', ')})`
                  : '';
                await database.query(`CREATE TABLE ${tableName} (${columns}${primaryKey})`);
              }
            },
            down: async (database) => {
              if (database instanceof PostgresTestDB) {
                await database.query(`DROP TABLE IF EXISTS ${tableName}`);
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
      const isNullable = row.is_nullable === 'YES';

      tables[tableName] ??= { columns: {} };
      tables[tableName].columns[columnName] = { type, nullable: isNullable };
    }

    return tables;
  }

  private getMongoCollections(
    database: MongoDBTestDB
  ): Promise<Record<string, { indexes: IndexDefinition[] }>> {
    // This is a simplified implementation - in practice, you'd query MongoDB system collections
    this.logger.debug('Getting MongoDB collections', { database: database.constructor.name });
    const collections: Record<string, { indexes: IndexDefinition[] }> = {};
    // Implementation would query system.indexes collection
    return Promise.resolve(collections);
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
  sourceDatabase: PostgresTestDB | MongoDBTestDB,
  targetDatabase: PostgresTestDB | MongoDBTestDB,
  schema: SchemaDefinition
): Promise<{
  hasDrift: boolean;
  sourceDifferences: string[];
  targetDifferences: string[];
}> => {
  const tester = new SchemaMigrationTester();
  return tester.detectSchemaDrift(sourceDatabase, targetDatabase, schema);
};

export const generateSchemaMigration = (
  currentSchema: SchemaDefinition,
  targetSchema: SchemaDefinition
): MigrationStep[] => {
  const tester = new SchemaMigrationTester();
  return tester.generateMigration(currentSchema, targetSchema);
};
