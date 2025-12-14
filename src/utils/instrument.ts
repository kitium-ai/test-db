import { measure } from '@kitiumai/scripts/utils';

import { withSpan } from './telemetry.js';

export function instrument<T>(
  measureName: string,
  spanName: string,
  function_: () => Promise<T>,
  attributes?: Record<string, unknown>
): Promise<T> {
  return measure(measureName, () => withSpan(spanName, function_, attributes));
}
