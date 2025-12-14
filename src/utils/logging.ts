/**
 * @kitium-ai/test-db - Logging utilities
 */

import { createMockLogger, type ILogger } from '@kitiumai/logger';

// Use mock logger to prevent async operations that hang Jest
const rootLogger = createMockLogger();

export function createLogger(scope: string): ILogger {
  if (typeof rootLogger.child === 'function') {
    return rootLogger.child({ scope });
  }
  return rootLogger;
}

export { ILogger };
