/**
 * @kitium-ai/test-db - Logging utilities
 */

import { getLogger, type ILogger } from '@kitiumai/logger';

let rootLogger: ILogger | null = null;

// No-op logger for when logger is not initialized
const noOpLogger: ILogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => noOpLogger,
} as ILogger;

function initRootLogger(): ILogger {
  if (!rootLogger) {
    try {
      rootLogger = getLogger().child({
        package: '@kitium-ai/test-db',
      });
    } catch {
      // Return no-op logger if logger is not initialized
      rootLogger = noOpLogger;
    }
  }
  return rootLogger;
}

export function createLogger(scope: string): ILogger {
  const root = initRootLogger();
  if (typeof root.child === 'function') {
    return root.child({ scope });
  }
  return root;
}

export { ILogger };
