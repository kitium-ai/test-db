import { performance } from 'node:perf_hooks';

import { createLogger } from './logging.js';

const logger = createLogger('TestDB:Telemetry');

type TelemetryApi = {
  trace: {
    getTracer: (name: string) => {
      startSpan: (name: string, options?: { attributes?: Record<string, unknown> }) => Span;
    };
  };
  context: { active: () => unknown; with: (context: unknown, function_: () => unknown) => unknown };
  // traceContext: unknown; // Removed as it's not in the API and caused a type error

  SpanStatusCode?: { ERROR: number };
};

type Span = {
  setAttribute?: (key: string, value: unknown) => void;
  recordException?: (error: unknown) => void;
  setStatus?: (status: { code: number; message?: string }) => void;
  end?: () => void;
};

const loadTelemetryApi = async (): Promise<TelemetryApi | null> => {
  try {
    const api = await import('@opentelemetry/api');
    return api as TelemetryApi;
  } catch {
    logger.debug('OpenTelemetry not available, falling back to logger metrics');
    return null;
  }
};

async function runNoopSpan<T>(
  name: string,
  function_: () => Promise<T>,
  start: number,
  attributes?: Record<string, unknown>
): Promise<T> {
  try {
    const result = await function_();
    const durationMs = performance.now() - start;
    logger.debug('Operation completed (no-op span)', { name, durationMs, attributes });
    return result;
  } catch (error) {
    const durationMs = performance.now() - start;
    logger.error('Operation failed (no-op span)', { name, durationMs, attributes }, error as Error);
    throw error;
  }
}

async function runTelemetrySpan<T>(
  telemetry: TelemetryApi,
  name: string,
  function_: () => Promise<T>,
  attributes?: Record<string, unknown>
): Promise<T> {
  const tracer = telemetry.trace.getTracer('@kitium-ai/test-db');
  const span: Span = tracer.startSpan(name, attributes ? { attributes } : undefined);

  try {
    return (await telemetry.context.with(telemetry.context.active(), function_)) as T;
  } catch (error) {
    span.recordException?.(error);
    const errorCode = telemetry.SpanStatusCode?.ERROR ?? 2;
    span.setStatus?.({ code: errorCode, message: (error as Error).message });
    throw error;
  } finally {
    span.end?.();
  }
}

export async function withSpan<T>(
  name: string,
  function_: () => Promise<T>,
  attributes?: Record<string, unknown>
): Promise<T> {
  const telemetry = await loadTelemetryApi();
  const start = performance.now();

  if (telemetry === null) {
    return runNoopSpan(name, function_, start, attributes);
  }

  return runTelemetrySpan(telemetry, name, function_, attributes);
}
