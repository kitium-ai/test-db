export type SerializedError = {
  name?: string;
  message: string;
  stack?: string;
};

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack !== undefined && { stack: error.stack }),
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

export function addErrorToMeta(
  meta: Record<string, unknown> | undefined,
  error: unknown
): Record<string, unknown> & { error: SerializedError } {
  return {
    ...(meta ?? {}),
    error: serializeError(error),
  };
}
