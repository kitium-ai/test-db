/**
 * @kitium-ai/test-db - Logging utilities
 */

import { getLogger, type ILogger } from '@kitiumai/logger';

const rootLogger = getLogger().child({
  package: '@kitium-ai/test-db',
});

export function createLogger(scope: string): ILogger {
  if (typeof rootLogger.child === 'function') {
    return rootLogger.child({ scope });
  }
  return rootLogger;
}

export { ILogger };
