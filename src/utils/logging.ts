/**
 * @kitium-ai/test-db - Logging utilities
 */

import { getTestLogger } from '@kitiumai/test-core';
import type { ILogger } from '@kitiumai/logger';

const rootLogger = getTestLogger('@kitium-ai/test-db');

export function createLogger(scope: string): ILogger {
  if (typeof rootLogger.child === 'function') {
    return rootLogger.child({ scope });
  }
  return rootLogger;
}

export { ILogger };
