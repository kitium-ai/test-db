/**
 * Advanced observability utilities for database testing
 */

import { EventEmitter } from 'events';

import { createLogger, ILogger } from './logging.js';
import { withSpan } from './telemetry.js';

export interface ObservabilityConfig {
  enableMetrics: boolean;
  enableTracing: boolean;
  enableLogging: boolean;
  metrics: {
    collectionInterval: number;
    retentionPeriod: number;
    exporters: string[];
  };
  tracing: {
    samplingRate: number;
    maxSpansPerTrace: number;
    exporters: string[];
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format: 'json' | 'text';
    exporters: string[];
  };
}

export interface MetricPoint {
  name: string;
  value: number;
  timestamp: number;
  tags: Record<string, string>;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
}

export interface TraceSpan {
  id: string;
  traceId: string;
  parentId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  attributes: Record<string, unknown>;
  events: Array<{
    name: string;
    timestamp: number;
    attributes: Record<string, unknown>;
  }>;
  status: {
    code: 'ok' | 'error';
    message?: string;
  };
}

export interface LogEntry {
  timestamp: number;
  level: string;
  message: string;
  context: Record<string, unknown>;
  error?: Error;
}

export interface DashboardData {
  metrics: {
    queryLatency: MetricPoint[];
    connectionPoolUsage: MetricPoint[];
    errorRate: MetricPoint[];
    throughput: MetricPoint[];
  };
  traces: {
    recentSpans: TraceSpan[];
    slowQueries: TraceSpan[];
    errorTraces: TraceSpan[];
  };
  logs: {
    recentErrors: LogEntry[];
    warnings: LogEntry[];
    performanceLogs: LogEntry[];
  };
  alerts: Array<{
    id: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    timestamp: number;
    resolved: boolean;
  }>;
}

export class AdvancedObservabilityManager {
  private readonly logger: ILogger;
  private readonly eventEmitter: EventEmitter;
  private config: ObservabilityConfig;
  private metrics: Map<string, MetricPoint[]> = new Map();
  private activeSpans: Map<string, TraceSpan> = new Map();
  private logs: LogEntry[] = [];
  private alerts: Array<DashboardData['alerts'][0]> = [];
  private collectionInterval?: NodeJS.Timeout;

  constructor(config: Partial<ObservabilityConfig> = {}) {
    this.logger = createLogger('AdvancedObservabilityManager');
    this.eventEmitter = new EventEmitter();

    this.config = {
      enableMetrics: true,
      enableTracing: true,
      enableLogging: true,
      metrics: {
        collectionInterval: 10000, // 10 seconds
        retentionPeriod: 3600000, // 1 hour
        exporters: ['console'],
      },
      tracing: {
        samplingRate: 1.0,
        maxSpansPerTrace: 1000,
        exporters: ['console'],
      },
      logging: {
        level: 'info',
        format: 'json',
        exporters: ['console'],
      },
      ...config,
    };

    this.startCollection();
  }

  /**
   * Record a metric point
   */
  public recordMetric(point: Omit<MetricPoint, 'timestamp'>): void {
    if (!this.config.enableMetrics) {
      return;
    }

    const metricPoint: MetricPoint = {
      ...point,
      timestamp: Date.now(),
    };

    const existing = this.metrics.get(point.name) || [];
    existing.push(metricPoint);

    // Keep only recent metrics
    const cutoff = Date.now() - this.config.metrics.retentionPeriod;
    const filtered = existing.filter((p) => p.timestamp > cutoff);

    this.metrics.set(point.name, filtered);

    this.logger.debug('Metric recorded', { name: point.name, value: point.value });
  }

  /**
   * Start a new trace span
   */
  public startSpan(
    name: string,
    attributes: Record<string, unknown> = {},
    parentId?: string
  ): string {
    if (!this.config.enableTracing) {
      return '';
    }

    const spanId = this.generateId();
    const traceId = parentId ? this.getTraceId(parentId) : this.generateId();

    const span: TraceSpan = {
      id: spanId,
      traceId,
      ...(parentId && { parentId }),
      name,
      startTime: Date.now(),
      attributes,
      events: [],
      status: { code: 'ok' },
    };

    this.activeSpans.set(spanId, span);

    this.logger.debug('Span started', { spanId, traceId, name });

    return spanId;
  }

  /**
   * End a trace span
   */
  public endSpan(spanId: string, status?: TraceSpan['status']): void {
    if (!this.config.enableTracing) {
      return;
    }

    const span = this.activeSpans.get(spanId);
    if (!span) {
      this.logger.warn('Attempted to end non-existent span', { spanId });
      return;
    }

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;

    if (status) {
      span.status = status;
    }

    this.logger.debug('Span ended', {
      spanId,
      duration: span.duration,
      status: span.status.code,
    });

    // Move to completed spans (in a real implementation, this would be persisted)
    this.activeSpans.delete(spanId);
  }

  /**
   * Add an event to a span
   */
  public addSpanEvent(
    spanId: string,
    name: string,
    attributes: Record<string, unknown> = {}
  ): void {
    if (!this.config.enableTracing) {
      return;
    }

    const span = this.activeSpans.get(spanId);
    if (!span) {
      return;
    }

    span.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });
  }

  /**
   * Log a message
   */
  public log(
    level: LogEntry['level'],
    message: string,
    context: Record<string, unknown> = {},
    error?: Error
  ): void {
    if (!this.config.enableLogging) {
      return;
    }

    const logLevelPriority: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
    const configLevelPriority = logLevelPriority[this.config.logging.level] ?? 1;
    const currentLevelPriority = logLevelPriority[level] ?? 0;

    if (currentLevelPriority < configLevelPriority) {
      return;
    }

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      context,
      ...(error && { error }),
    };

    this.logs.push(entry);

    // Keep only recent logs
    const cutoff = Date.now() - this.config.metrics.retentionPeriod;
    this.logs = this.logs.filter((log) => log.timestamp > cutoff);

    // Emit log event
    this.eventEmitter.emit('log', entry);
  }

  /**
   * Create an alert
   */
  public createAlert(severity: DashboardData['alerts'][0]['severity'], message: string): string {
    const alert = {
      id: this.generateId(),
      severity,
      message,
      timestamp: Date.now(),
      resolved: false,
    };

    this.alerts.push(alert);

    this.logger.warn('Alert created', { id: alert.id, severity, message });

    // Emit alert event
    this.eventEmitter.emit('alert', alert);

    return alert.id;
  }

  /**
   * Resolve an alert
   */
  public resolveAlert(alertId: string): void {
    const alert = this.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      this.logger.info('Alert resolved', { id: alertId });
    }
  }

  /**
   * Get dashboard data
   */
  public async getDashboardData(): Promise<DashboardData> {
    return withSpan('observability.dashboard.get', async () => {
      const now = Date.now();
      const oneHourAgo = now - 3600000;

      return {
        metrics: {
          queryLatency: this.getMetricsByName('query.latency', oneHourAgo),
          connectionPoolUsage: this.getMetricsByName('connection.pool.usage', oneHourAgo),
          errorRate: this.getMetricsByName('error.rate', oneHourAgo),
          throughput: this.getMetricsByName('throughput', oneHourAgo),
        },
        traces: {
          recentSpans: this.getRecentSpans(50),
          slowQueries: this.getSlowSpans(100), // > 100ms
          errorTraces: this.getErrorSpans(),
        },
        logs: {
          recentErrors: this.getLogsByLevel('error', 20),
          warnings: this.getLogsByLevel('warn', 20),
          performanceLogs: this.getPerformanceLogs(20),
        },
        alerts: this.alerts.filter((a) => !a.resolved || a.timestamp > oneHourAgo),
      };
    });
  }

  /**
   * Export metrics to external systems
   */
  public async exportMetrics(): Promise<void> {
    if (!this.config.enableMetrics) {
      return;
    }

    for (const exporter of this.config.metrics.exporters) {
      try {
        await this.exportToSystem(exporter, 'metrics', Array.from(this.metrics.values()).flat());
      } catch (error) {
        this.logger.error('Failed to export metrics', { exporter, error });
      }
    }
  }

  /**
   * Export traces to external systems
   */
  public async exportTraces(): Promise<void> {
    if (!this.config.enableTracing) {
      return;
    }

    const completedSpans = Array.from(this.activeSpans.values()).filter((span) => span.endTime);

    for (const exporter of this.config.tracing.exporters) {
      try {
        await this.exportToSystem(exporter, 'traces', completedSpans);
      } catch (error) {
        this.logger.error('Failed to export traces', { exporter, error });
      }
    }
  }

  /**
   * Export logs to external systems
   */
  public async exportLogs(): Promise<void> {
    if (!this.config.enableLogging) {
      return;
    }

    for (const exporter of this.config.logging.exporters) {
      try {
        await this.exportToSystem(exporter, 'logs', this.logs);
      } catch (error) {
        this.logger.error('Failed to export logs', { exporter, error });
      }
    }
  }

  /**
   * Set up alerting rules
   */
  public setupAlertingRules(
    rules: Array<{
      name: string;
      condition: (data: DashboardData) => boolean;
      severity: DashboardData['alerts'][0]['severity'];
      message: string;
      cooldownMs: number;
    }>
  ): void {
    const lastTriggered: Map<string, number> = new Map();

    const checkRules = async (): Promise<void> => {
      const data = await this.getDashboardData();

      for (const rule of rules) {
        const lastTrigger = lastTriggered.get(rule.name) || 0;
        const now = Date.now();

        if (now - lastTrigger < rule.cooldownMs) {
          continue;
        }

        if (rule.condition(data)) {
          this.createAlert(rule.severity, rule.message);
          lastTriggered.set(rule.name, now);
        }
      }
    };

    // Check rules every minute
    setInterval(checkRules, 60000);
  }

  /**
   * Clean up resources
   */
  public shutdown(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }

    this.eventEmitter.removeAllListeners();
    this.logger.info('Observability manager shut down');
  }

  private startCollection(): void {
    if (!this.config.enableMetrics) {
      return;
    }

    this.collectionInterval = setInterval(async () => {
      try {
        await this.exportMetrics();
        await this.exportTraces();
        await this.exportLogs();
      } catch (error) {
        this.logger.error('Failed to export observability data', { error });
      }
    }, this.config.metrics.collectionInterval);
  }

  private getMetricsByName(name: string, since: number): MetricPoint[] {
    return this.metrics.get(name)?.filter((m) => m.timestamp > since) || [];
  }

  private getRecentSpans(limit: number): TraceSpan[] {
    return Array.from(this.activeSpans.values())
      .filter((span) => span.endTime)
      .sort((a, b) => (b.endTime || 0) - (a.endTime || 0))
      .slice(0, limit);
  }

  private getSlowSpans(thresholdMs: number): TraceSpan[] {
    return Array.from(this.activeSpans.values())
      .filter((span) => span.duration && span.duration > thresholdMs)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0));
  }

  private getErrorSpans(): TraceSpan[] {
    return Array.from(this.activeSpans.values()).filter((span) => span.status.code === 'error');
  }

  private getLogsByLevel(level: string, limit: number): LogEntry[] {
    return this.logs
      .filter((log) => log.level === level)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  private getPerformanceLogs(limit: number): LogEntry[] {
    return this.logs
      .filter((log) => log.context['performance'] === true)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  private getTraceId(spanId: string): string {
    const span = this.activeSpans.get(spanId);
    return span?.traceId || this.generateId();
  }

  private async exportToSystem(exporter: string, type: string, data: unknown): Promise<void> {
    switch (exporter) {
      case 'console':
        console.log(`[${type.toUpperCase()}]`, data);
        break;
      case 'prometheus':
        // In a real implementation, this would send to Prometheus
        this.logger.debug('Would export to Prometheus', {
          type,
          dataCount: Array.isArray(data) ? data.length : 1,
        });
        break;
      case 'jaeger':
        // In a real implementation, this would send to Jaeger
        this.logger.debug('Would export to Jaeger', {
          type,
          dataCount: Array.isArray(data) ? data.length : 1,
        });
        break;
      case 'elasticsearch':
        // In a real implementation, this would send to Elasticsearch
        this.logger.debug('Would export to Elasticsearch', {
          type,
          dataCount: Array.isArray(data) ? data.length : 1,
        });
        break;
      default:
        this.logger.warn('Unknown exporter', { exporter });
    }
  }
}

// Convenience functions for common observability patterns
export const createDatabaseMetrics = (
  manager: AdvancedObservabilityManager
): {
  recordQueryLatency: (latency: number, queryType: string, database: string) => void;
  recordConnectionCount: (count: number, database: string) => void;
  recordQueryCount: (database: string, queryType: string) => void;
  recordErrorCount: (database: string, errorType: string) => void;
  recordConnectionPoolUsage: (used: number, total: number, database: string) => void;
  recordError: (errorType: string, database: string) => void;
  recordThroughput: (operations: number, database: string) => void;
} => ({
  recordQueryLatency: (latency: number, queryType: string, database: string) => {
    manager.recordMetric({
      name: 'query.latency',
      value: latency,
      tags: { queryType, database },
      type: 'histogram',
    });
  },

  recordConnectionCount: (count: number, database: string) => {
    manager.recordMetric({
      name: 'connection.count',
      value: count,
      tags: { database },
      type: 'gauge',
    });
  },

  recordQueryCount: (database: string, queryType: string) => {
    manager.recordMetric({
      name: 'query.count',
      value: 1,
      tags: { database, queryType },
      type: 'counter',
    });
  },

  recordErrorCount: (database: string, errorType: string) => {
    manager.recordMetric({
      name: 'error.count',
      value: 1,
      tags: { database, errorType },
      type: 'counter',
    });
  },

  recordConnectionPoolUsage: (used: number, total: number, database: string) => {
    manager.recordMetric({
      name: 'connection.pool.usage',
      value: (used / total) * 100,
      tags: { database },
      type: 'gauge',
    });
  },

  recordError: (errorType: string, database: string) => {
    manager.recordMetric({
      name: 'error.rate',
      value: 1,
      tags: { errorType, database },
      type: 'counter',
    });
  },

  recordThroughput: (operations: number, database: string) => {
    manager.recordMetric({
      name: 'throughput',
      value: operations,
      tags: { database },
      type: 'counter',
    });
  },
});

export const createDatabaseTracing = (
  manager: AdvancedObservabilityManager
): {
  startQuerySpan: (query: string, database: string, params?: Record<string, unknown>) => string;
  startTransactionSpan: (name: string, database: string) => string;
  addQueryEvent: (spanId: string, query: string, rowCount?: number) => void;
} => ({
  startQuerySpan: (query: string, database: string, params?: Record<string, unknown>) => {
    return manager.startSpan('database.query', {
      /* eslint-disable @typescript-eslint/naming-convention */
      'db.statement': query,
      'db.system': database,
      'db.params': params,
      /* eslint-enable @typescript-eslint/naming-convention */
    });
  },

  startTransactionSpan: (name: string, database: string) => {
    return manager.startSpan('database.transaction', {
      /* eslint-disable @typescript-eslint/naming-convention */
      'db.system': database,
      'transaction.name': name,
      /* eslint-enable @typescript-eslint/naming-convention */
    });
  },

  addQueryEvent: (spanId: string, query: string, rowCount?: number) => {
    manager.addSpanEvent(spanId, 'query.executed', {
      query: query.substring(0, 100), // Truncate long queries
      rowCount,
    });
  },
});

export const createDatabaseLogging = (
  manager: AdvancedObservabilityManager
): {
  logQuery: (
    level: LogEntry['level'],
    query: string,
    duration: number,
    context?: Record<string, unknown>
  ) => void;
  logTransaction: (
    level: LogEntry['level'],
    name: string,
    duration: number,
    context?: Record<string, unknown>
  ) => void;
  logError: (error: Error, context?: Record<string, unknown>) => void;
  logConnection: (
    action: 'acquired' | 'released' | 'failed',
    database: string,
    error?: Error
  ) => void;
  logMigration: (
    migrationName: string,
    status: 'started' | 'completed' | 'failed',
    context?: Record<string, unknown>
  ) => void;
} => ({
  logQuery: (
    level: LogEntry['level'],
    query: string,
    duration: number,
    context?: Record<string, unknown>
  ) => {
    manager.log(level, 'Database query executed', {
      query: query.substring(0, 200),
      duration,
      performance: duration > 1000, // Mark as performance log if slow
      ...context,
    });
  },

  logTransaction: (
    level: LogEntry['level'],
    name: string,
    duration: number,
    context?: Record<string, unknown>
  ) => {
    manager.log(level, 'Database transaction executed', {
      transaction: name,
      duration,
      performance: duration > 1000, // Mark as performance log if slow
      ...context,
    });
  },

  logError: (error: Error, context?: Record<string, unknown>) => {
    manager.log('error', error.message, context, error);
  },

  logConnection: (action: 'acquired' | 'released' | 'failed', database: string, error?: Error) => {
    manager.log(
      action === 'failed' ? 'error' : 'info',
      `Database connection ${action}`,
      { database },
      error
    );
  },

  logMigration: (
    migrationName: string,
    status: 'started' | 'completed' | 'failed',
    context?: Record<string, unknown>
  ) => {
    manager.log(
      status === 'failed' ? 'error' : 'info',
      `Schema migration ${status}`,
      { migration: migrationName, ...context },
      context?.['error'] as Error | undefined
    );
  },
});

// Default alerting rules
export const defaultAlertingRules = [
  {
    name: 'high-error-rate',
    condition: (data: DashboardData) => {
      const recentErrors = data.metrics.errorRate.filter((m) => m.timestamp > Date.now() - 300000); // Last 5 minutes
      return recentErrors.length > 10;
    },
    severity: 'high' as const,
    message: 'High error rate detected in database operations',
    cooldownMs: 300000, // 5 minutes
  },
  {
    name: 'slow-queries',
    condition: (data: DashboardData) => data.traces.slowQueries.length > 5,
    severity: 'medium' as const,
    message: 'Multiple slow queries detected',
    cooldownMs: 600000, // 10 minutes
  },
  {
    name: 'connection-pool-exhausted',
    condition: (data: DashboardData) => {
      const recentPoolUsage = data.metrics.connectionPoolUsage.slice(-5);
      return recentPoolUsage.some((m) => m.value > 95);
    },
    severity: 'critical' as const,
    message: 'Database connection pool nearly exhausted',
    cooldownMs: 120000, // 2 minutes
  },
];
