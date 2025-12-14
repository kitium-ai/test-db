/**
 * @kitium-ai/test-db - Logging utilities
 */

import { createLogger as createKitiumLogger, type ILogger } from '@kitiumai/logger';

const rootLogger = createKitiumLogger('development', { serviceName: '@kitiumai/test-db' });

export function createLogger(scope: string): ILogger {
  if (typeof rootLogger.child === 'function') {
    return rootLogger.child({ scope });
  }
  return rootLogger;
}

export { ILogger };
