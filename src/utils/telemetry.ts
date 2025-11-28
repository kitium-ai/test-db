import { performance } from 'node:perf_hooks';
import { createLogger } from './logging.js';

const logger = createLogger('TestDB:Telemetry');

interface TelemetryApi {
  trace: {
    getTracer: (name: string) => { startSpan: (name: string, options?: { attributes?: Record<string, unknown> }) => Span };
  };
  context: { active: () => unknown; with: (ctx: unknown, fn: () => unknown) => unknown };
  traceContext: unknown;
  SpanStatusCode?: { ERROR: number };
}

interface Span {
  setAttribute?: (key: string, value: unknown) => void;
  recordException?: (error: unknown) => void;
  setStatus?: (status: { code: number; message?: string }) => void;
  end?: () => void;
}

const loadTelemetryApi = async (): Promise<TelemetryApi | null> => {
  try {
    const api = await import('@opentelemetry/api');
    return api as TelemetryApi;
  } catch (error) {
    logger.debug('OpenTelemetry not available, falling back to logger metrics');
    return null;
  }
};

export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, unknown>
): Promise<T> {
  const telemetry = await loadTelemetryApi();
  const start = performance.now();

  if (!telemetry) {
    try {
      const result = await fn();
      const durationMs = performance.now() - start;
      logger.debug('Operation completed (no-op span)', { name, durationMs, attributes });
      return result;
    } catch (error) {
      const durationMs = performance.now() - start;
      logger.error('Operation failed (no-op span)', { name, durationMs, attributes }, error as Error);
      throw error;
    }
  }

  const tracer = telemetry.trace.getTracer('@kitium-ai/test-db');
  const span: Span = tracer.startSpan(name, { attributes });

  try {
    const result = await telemetry.context.with(telemetry.context.active(), fn) as T;
    return result;
  } catch (error) {
    span.recordException?.(error);
    const errorCode = telemetry.SpanStatusCode?.ERROR ?? 2;
    span.setStatus?.({ code: errorCode, message: (error as Error).message });
    throw error;
  } finally {
    span.end?.();
  }
}
