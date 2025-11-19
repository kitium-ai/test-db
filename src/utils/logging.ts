/**
 * @kitium-ai/test-db - Logging utilities
 */

import { ILogger } from '../types/index.js';

class Logger implements ILogger {
  private readonly name: string;
  private readonly debug_enabled: boolean;

  constructor(name: string, debugEnabled: boolean = false) {
    this.name = name;
    this.debug_enabled = debugEnabled;
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    console.log(`[${this.name}] ℹ️  ${message}`, meta ? JSON.stringify(meta) : '');
  }

  public error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    console.error(
      `[${this.name}] ❌ ${message}`,
      error ? error.message : '',
      meta ? JSON.stringify(meta) : ''
    );
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[${this.name}] ⚠️  ${message}`, meta ? JSON.stringify(meta) : '');
  }

  public debug(message: string, meta?: Record<string, unknown>): void {
    if (this.debug_enabled) {
      console.debug(`[${this.name}] 🐛 ${message}`, meta ? JSON.stringify(meta) : '');
    }
  }
}

export function createLogger(name: string, debugEnabled?: boolean): ILogger {
  return new Logger(name, debugEnabled);
}

export { Logger, ILogger };
