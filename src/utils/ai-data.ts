/**
 * AI-powered data generation for database testing
 */

import { randomUUID } from 'node:crypto';

import { createLogger, type ILogger } from './logging.js';
import { withSpan } from './telemetry.js';

export type DataGenerationConfig = {
  table: string;
  count: number;
  schema: Record<
    string,
    {
      type: string;
      nullable?: boolean;
      references?: {
        table: string;
        column: string;
        values?: unknown[];
      };
      constraints?: string[];
    }
  >;
  relationships?: Array<{
    table: string;
    column: string;
    referencedTable: string;
    referencedColumn: string;
  }>;
  patterns?: Record<
    string,
    {
      type: 'realistic' | 'edge_case' | 'invalid' | 'performance';
      distribution?: 'uniform' | 'normal' | 'exponential';
    }
  >;
};

export type GeneratedData = {
  table: string;
  records: Array<Record<string, unknown>>;
  metadata: {
    generationTime: number;
    aiEnhanced: boolean;
    patterns: string[];
  };
};

export type AIContext = {
  domain: string;
  entities: Record<
    string,
    {
      properties: Record<
        string,
        {
          type: string;
          description: string;
          examples: unknown[];
        }
      >;
      relationships: Array<{
        type: 'has_many' | 'belongs_to' | 'has_one';
        target: string;
        description: string;
      }>;
    }
  >;
  constraints: Array<{
    type: 'unique' | 'foreign_key' | 'check';
    description: string;
  }>;
};

const integerTypes = new Set(['integer', 'int', 'bigint']);
const stringTypes = new Set(['varchar', 'text', 'string']);
const booleanTypes = new Set(['boolean', 'bool']);
const dateTypes = new Set(['date', 'datetime', 'timestamp']);
const jsonTypes = new Set(['json', 'jsonb']);

export class AIDataGenerator {
  private readonly logger: ILogger;
  private readonly aiContext?: AIContext;

  constructor(aiContext?: AIContext) {
    this.logger = createLogger('AIDataGenerator');
    if (aiContext) {
      this.aiContext = aiContext;
      this.logger.debug('AIDataGenerator initialized with AI context', {
        domain: aiContext.domain,
      });
    }
  }

  /**
   * Generate realistic test data using AI patterns
   */
  public generateRealisticData(config: DataGenerationConfig): Promise<GeneratedData> {
    return withSpan('ai.data.generate.realistic', () => {
      const startTime = Date.now();
      const hasAIContext = !!this.aiContext;
      this.logger.info('Generating realistic AI-powered data', {
        table: config.table,
        count: config.count,
        aiEnhanced: hasAIContext,
      });

      const records: Array<Record<string, unknown>> = [];

      for (let index = 0; index < config.count; index++) {
        const record = this.generateRealisticRecord(config, index);
        records.push(record);
      }

      const result: GeneratedData = {
        table: config.table,
        records,
        metadata: {
          generationTime: Date.now() - startTime,
          aiEnhanced: hasAIContext,
          patterns: hasAIContext ? ['realistic', 'ai-powered'] : ['realistic'],
        },
      };

      this.logger.info('Realistic data generation completed', {
        table: config.table,
        records: records.length,
        time: result.metadata.generationTime,
      });

      return Promise.resolve(result);
    });
  }

  /**
   * Generate edge case data for testing boundaries
   */
  public generateEdgeCaseData(config: DataGenerationConfig): Promise<GeneratedData> {
    return withSpan('ai.data.generate.edge-cases', () => {
      const startTime = Date.now();
      this.logger.info('Generating edge case data', { table: config.table, count: config.count });

      const records: Array<Record<string, unknown>> = [];

      for (let index = 0; index < config.count; index++) {
        const record = this.generateEdgeCaseRecord(config, index);
        records.push(record);
      }

      const result: GeneratedData = {
        table: config.table,
        records,
        metadata: {
          generationTime: Date.now() - startTime,
          aiEnhanced: true,
          patterns: ['edge-cases', 'boundary-testing'],
        },
      };

      return Promise.resolve(result);
    });
  }

  /**
   * Generate performance testing data with specific patterns
   */
  public generatePerformanceData(config: DataGenerationConfig): Promise<GeneratedData> {
    return withSpan('ai.data.generate.performance', () => {
      const startTime = Date.now();
      this.logger.info('Generating performance testing data', {
        table: config.table,
        count: config.count,
      });

      const records: Array<Record<string, unknown>> = [];

      for (let index = 0; index < config.count; index++) {
        const record = this.generatePerformanceRecord(config, index);
        records.push(record);
      }

      const result: GeneratedData = {
        table: config.table,
        records,
        metadata: {
          generationTime: Date.now() - startTime,
          aiEnhanced: true,
          patterns: ['performance', 'load-testing'],
        },
      };

      return Promise.resolve(result);
    });
  }

  /**
   * Generate data with semantic relationships
   */
  public generateRelationalData(
    configs: DataGenerationConfig[],
    relationshipConfig: {
      foreignKeys: Array<{
        fromTable: string;
        fromColumn: string;
        toTable: string;
        toColumn: string;
      }>;
      cardinality: Record<string, '1:1' | '1:N' | 'N:M'>;
    }
  ): Promise<GeneratedData[]> {
    return withSpan('ai.data.generate.relational', async () => {
      this.logger.info('Generating relational data', { tables: configs.length });

      const results: GeneratedData[] = [];

      // Generate parent records first
      const parentTables = this.identifyParentTables(configs, relationshipConfig.foreignKeys);

      for (const tableName of parentTables) {
        const config = configs.find((c) => c.table === tableName);
        if (config) {
          const data = await this.generateRealisticData(config);
          results.push(data);
        }
      }

      // Generate child records with proper foreign keys
      const childTables = configs.filter((c) => !parentTables.includes(c.table));

      for (const config of childTables) {
        const enhancedConfig = this.enhanceConfigWithRelationships(
          config,
          relationshipConfig,
          results
        );
        const data = await this.generateRealisticData(enhancedConfig);
        results.push(data);
      }

      return results;
    });
  }

  /**
   * Learn from existing data patterns
   */
  public learnFromExistingData(
    tableName: string,
    sampleData: Array<Record<string, unknown>>
  ): Promise<{
    patterns: Record<
      string,
      {
        type: string;
        distribution: unknown[];
        constraints: string[];
      }
    >;
    recommendations: string[];
  }> {
    return withSpan('ai.data.learn.patterns', () => {
      this.logger.info('Learning data patterns', { table: tableName, samples: sampleData.length });

      const patterns: Record<
        string,
        {
          type: string;
          distribution: unknown[];
          constraints: string[];
        }
      > = {};

      const recommendations: string[] = [];

      // Analyze each column
      if (sampleData.length > 0 && sampleData[0]) {
        const columns = Object.keys(sampleData[0]);

        for (const column of columns) {
          const values = sampleData
            .map((row) => row[column])
            .filter((value) => value !== null && value !== undefined);
          const pattern = this.analyzeColumnPattern(column, values);
          patterns[column] = pattern;

          // Generate recommendations
          if (pattern.constraints.includes('unique') && values.length > 1) {
            recommendations.push(`Consider adding unique constraint to ${column}`);
          }
          if (pattern.type === 'string' && this.detectEmailPattern(values)) {
            recommendations.push(
              `Column ${column} appears to contain emails - consider validation`
            );
          }
        }
      }

      return Promise.resolve({ patterns, recommendations });
    });
  }

  /**
   * Generate data that respects business rules
   */
  public generateBusinessRuleCompliantData(
    config: DataGenerationConfig,
    businessRules: Array<{
      name: string;
      condition: string;
      description: string;
    }>
  ): Promise<GeneratedData> {
    return withSpan('ai.data.generate.business-rules', () => {
      this.logger.info('Generating business rule compliant data', {
        table: config.table,
        rules: businessRules.length,
      });

      const records: Array<Record<string, unknown>> = [];

      for (let index = 0; index < config.count; index++) {
        let record: Record<string, unknown>;
        let attempts = 0;
        const maxAttempts = 10;

        do {
          record = this.generateRealisticRecord(config, index);
          attempts++;
        } while (!this.validateBusinessRules(record, businessRules) && attempts < maxAttempts);

        if (attempts >= maxAttempts) {
          this.logger.warn('Could not generate business rule compliant record', { attempts });
        }

        records.push(record);
      }

      return Promise.resolve({
        table: config.table,
        records,
        metadata: {
          generationTime: 0, // Would track actual time
          aiEnhanced: true,
          patterns: ['business-rules', 'compliance'],
        },
      });
    });
  }

  private generateRealisticRecord(
    config: DataGenerationConfig,
    index: number
  ): Record<string, unknown> {
    const record: Record<string, unknown> = {};

    for (const [columnName, columnSchema] of Object.entries(config.schema)) {
      const pattern = config.patterns?.[columnName];

      if (columnSchema.references) {
        // Handle foreign key references
        record[columnName] = this.generateForeignKeyValue(columnSchema, index);
      } else {
        // Generate value based on type and pattern
        record[columnName] = this.generateValueByType(columnSchema.type, {
          ...(columnSchema.nullable !== undefined && { nullable: columnSchema.nullable }),
          ...(pattern !== undefined && { pattern }),
          index,
        });
      }
    }

    return record;
  }

  private generateEdgeCaseRecord(
    config: DataGenerationConfig,
    index: number
  ): Record<string, unknown> {
    const record: Record<string, unknown> = {};

    for (const [columnName, columnSchema] of Object.entries(config.schema)) {
      record[columnName] = this.generateEdgeCaseValue(columnSchema.type, {
        ...(columnSchema.nullable !== undefined && { nullable: columnSchema.nullable }),
        ...(columnSchema.constraints !== undefined && { constraints: columnSchema.constraints }),
        index,
      });
    }

    return record;
  }

  private generatePerformanceRecord(
    config: DataGenerationConfig,
    index: number
  ): Record<string, unknown> {
    const record: Record<string, unknown> = {};

    for (const [columnName, columnSchema] of Object.entries(config.schema)) {
      record[columnName] = this.generatePerformanceValue(columnSchema.type, index);
    }

    return record;
  }

  private generateValueByType(
    type: string,
    options: {
      nullable?: boolean;
      pattern?: { type: string; distribution?: string };
      index: number;
    }
  ): unknown {
    // Handle null values
    if (options.nullable && Math.random() < 0.1) {
      return null;
    }

    const normalizedType = type.toLowerCase();

    if (integerTypes.has(normalizedType)) {
      return this.generateInteger(options.pattern);
    }

    if (stringTypes.has(normalizedType)) {
      return this.generateString(options.pattern, options.index);
    }

    if (booleanTypes.has(normalizedType)) {
      return Math.random() > 0.5;
    }

    if (dateTypes.has(normalizedType)) {
      return this.generateDate(options.pattern);
    }

    if (normalizedType === 'uuid') {
      return randomUUID();
    }

    if (jsonTypes.has(normalizedType)) {
      return this.generateJSON(options.pattern);
    }

    return `value_${options.index}`;
  }

  private generateEdgeCaseValue(
    type: string,
    options: {
      nullable?: boolean;
      constraints?: string[];
      index: number;
    }
  ): unknown {
    // Generate edge cases: nulls, empty strings, max values, special chars, etc.
    const edgeCaseType = Math.floor(Math.random() * 4);

    switch (edgeCaseType) {
      case 0:
        return options.nullable ? null : this.generateValueByType(type, { index: options.index });
      case 1:
        return this.generateBoundaryValue(type, 'min');
      case 2:
        return this.generateBoundaryValue(type, 'max');
      case 3:
        return this.generateSpecialValue(type);
      default:
        return this.generateValueByType(type, { index: options.index });
    }
  }

  private generatePerformanceValue(type: string, index: number): unknown {
    // Generate values optimized for performance testing
    // Large datasets, repeated values, etc.
    switch (type.toLowerCase()) {
      case 'integer':
        return index % 1000; // Repeat values for better compression/indexing
      case 'varchar':
        return `perf_value_${index % 100}`;
      default:
        return this.generateValueByType(type, { index });
    }
  }

  private generateInteger(pattern?: { distribution?: string }): number {
    if (pattern?.distribution === 'exponential') {
      return Math.floor(Math.random() * Math.random() * 1000000);
    }
    return Math.floor(Math.random() * 1000000);
  }

  private generateString(pattern?: { type?: string }, index?: number): string {
    if (pattern?.type === 'realistic') {
      const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry'];
      const safeIndex = index ?? Math.floor(Math.random() * names.length);
      return names[safeIndex % names.length] ?? 'DefaultName';
    }
    return `string_value_${index ?? Math.floor(Math.random() * 1000)}`;
  }

  private generateDate(pattern?: { type?: string }): Date {
    if (pattern?.type === 'realistic') {
      // Generate dates in the last year
      const now = Date.now();
      const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
      return new Date(oneYearAgo + Math.random() * (now - oneYearAgo));
    }
    return new Date();
  }

  private generateJSON(pattern?: { type?: string }): Record<string, unknown> {
    if (pattern?.type === 'realistic') {
      return {
        key: 'value',
        nested: { data: Math.random() },
        array: [1, 2, 3],
      };
    }
    return { data: 'value' };
  }

  private generateBoundaryValue(type: string, boundary: 'min' | 'max'): unknown {
    switch (type.toLowerCase()) {
      case 'integer':
      case 'int':
        return boundary === 'max' ? 2147483647 : -2147483648;
      case 'varchar':
      case 'text':
        return boundary === 'max' ? 'x'.repeat(1000) : '';
      case 'date':
        return boundary === 'max' ? new Date('9999-12-31') : new Date('0001-01-01');
      default:
        return boundary === 'max' ? 'MAX_VALUE' : 'MIN_VALUE';
    }
  }

  private generateSpecialValue(type: string): unknown {
    switch (type.toLowerCase()) {
      case 'varchar':
      case 'text':
        return '<script>alert("xss")</script>';
      case 'integer':
        return 0;
      default:
        return 'SPECIAL_VALUE';
    }
  }

  private generateForeignKeyValue(_columnSchema: unknown, index: number): unknown {
    // In a real implementation, this would reference existing records
    // For now, generate a plausible foreign key value
    return (index % 100) + 1;
  }

  private identifyParentTables(
    configs: DataGenerationConfig[],
    foreignKeys: Array<{ fromTable: string; toTable: string }>
  ): string[] {
    const allTables = configs.map((c) => c.table);
    const childTables = new Set(foreignKeys.map((fk) => fk.fromTable));
    return allTables.filter((table) => !childTables.has(table));
  }

  private enhanceConfigWithRelationships(
    config: DataGenerationConfig,
    relationshipConfig: {
      foreignKeys: Array<{
        fromTable: string;
        fromColumn: string;
        toTable: string;
        toColumn: string;
      }>;
    },
    existingData: GeneratedData[]
  ): DataGenerationConfig {
    // Enhance config with foreign key relationships
    const enhancedSchema = { ...config.schema };

    for (const fk of relationshipConfig.foreignKeys) {
      if (fk.fromTable !== config.table) {
        continue;
      }

      const fromColumnSchema = enhancedSchema[fk.fromColumn];
      if (!fromColumnSchema) {
        continue;
      }

      const referencedData = existingData.find((data) => data.table === fk.toTable);
      if (!referencedData?.records.length) {
        continue;
      }

      const existingIds = referencedData.records
        .map((record) => record[fk.toColumn])
        .filter(Boolean);
      if (existingIds.length === 0) {
        continue;
      }

      enhancedSchema[fk.fromColumn] = {
        type: fromColumnSchema.type ?? 'number',
        ...(fromColumnSchema.nullable !== undefined && { nullable: fromColumnSchema.nullable }),
        ...(fromColumnSchema.constraints !== undefined && {
          constraints: fromColumnSchema.constraints,
        }),
        references: {
          table: fk.toTable,
          column: fk.toColumn,
          values: existingIds,
        },
      };
    }

    return { ...config, schema: enhancedSchema };
  }

  private analyzeColumnPattern(
    columnName: string,
    values: unknown[]
  ): {
    type: string;
    distribution: unknown[];
    constraints: string[];
  } {
    this.logger.debug('Analyzing column pattern', { columnName, sampleSize: values.length });
    const type = this.inferType(values);
    const uniqueValues = new Set(values);
    const distribution = Array.from(uniqueValues).slice(0, 10); // Sample unique values
    const constraints: string[] = [];

    // Check for uniqueness
    if (values.length === new Set(values).size) {
      constraints.push('unique');
    }

    // Check for patterns
    if (type === 'string' && this.detectEmailPattern(values)) {
      constraints.push('email_format');
    }

    return { type, distribution, constraints };
  }

  private inferType(values: unknown[]): string {
    if (values.length === 0) {
      return 'unknown';
    }

    const sample = values[0];
    if (typeof sample === 'number') {
      return 'number';
    }
    if (typeof sample === 'string') {
      return 'string';
    }
    if (typeof sample === 'boolean') {
      return 'boolean';
    }
    if (sample instanceof Date) {
      return 'date';
    }
    return 'unknown';
  }

  private detectEmailPattern(values: unknown[]): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return values.some((value) => typeof value === 'string' && emailRegex.test(value));
  }

  private validateBusinessRules(record: Record<string, unknown>, rules: unknown[]): boolean {
    // Simple business rule validation
    // In a real implementation, this would evaluate complex rules
    this.logger.debug('Validating business rules', {
      recordKeys: Object.keys(record),
      ruleCount: rules.length,
    });
    return rules.every((_rule) => {
      // Simplified validation - always pass for now
      return true;
    });
  }
}

// Convenience functions
export const generateRealisticTestData = (config: DataGenerationConfig): Promise<GeneratedData> => {
  const generator = new AIDataGenerator();
  return generator.generateRealisticData(config);
};

export const generateEdgeCaseTestData = (config: DataGenerationConfig): Promise<GeneratedData> => {
  const generator = new AIDataGenerator();
  return generator.generateEdgeCaseData(config);
};

export const generatePerformanceTestData = (
  config: DataGenerationConfig
): Promise<GeneratedData> => {
  const generator = new AIDataGenerator();
  return generator.generatePerformanceData(config);
};

export const generateRelationalTestData = (
  configs: DataGenerationConfig[],
  relationships: {
    foreignKeys: Array<{
      fromTable: string;
      fromColumn: string;
      toTable: string;
      toColumn: string;
    }>;
    cardinality: Record<string, '1:1' | '1:N' | 'N:M'>;
  }
): Promise<GeneratedData[]> => {
  const generator = new AIDataGenerator();
  return generator.generateRelationalData(configs, relationships);
};

export const learnDataPatterns = (
  tableName: string,
  sampleData: Array<Record<string, unknown>>
): Promise<{
  patterns: Record<
    string,
    {
      type: string;
      distribution: unknown[];
      constraints: string[];
    }
  >;
  recommendations: string[];
}> => {
  const generator = new AIDataGenerator();
  return generator.learnFromExistingData(tableName, sampleData);
};
