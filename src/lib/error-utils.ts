import { isSecretKey, redactSecrets } from './redact-secrets';

// What a native alert(error) printed: "Name: message". Endpoint urls and secret fields are redacted.
export const formatError = (error: unknown): string => redactSecrets(error instanceof Error ? error.toString() : String(error));

// An Error's stack opens with its name and message, which can hold a secret, and goes on with frames,
// which are code locations that redacting their urls would drop. So only what comes before the first
// V8 frame line is redacted. A stack without V8 frames is redacted whole.
const redactStack = (stack: string): string => {
  const firstFrame = stack.search(/\n\s+at /);
  return firstFrame === -1 ? redactSecrets(stack) : `${redactSecrets(stack.slice(0, firstFrame))}${stack.slice(firstFrame)}`;
};

// An error as plain data, every field kept: name and message, PKC's code and details, cause, stack, and
// any other own field. Secret keys and the credentials in endpoint urls are redacted, as in /log.
const toPlainData = (value: unknown, key: string, seen: WeakSet<object>): unknown => {
  if (isSecretKey(key)) {
    return '[redacted]';
  }
  if (typeof value === 'string') {
    return redactSecrets(value);
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    return String(value);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return '[circular]';
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => toPlainData(item, '', seen));
    }
    // name, message, cause and stack are not enumerable on an Error, so they are read by name
    const data: Record<string, unknown> = value instanceof Error ? { name: value.name, message: toPlainData(value.message, 'message', seen) } : {};
    for (const [childKey, child] of Object.entries(value)) {
      data[childKey] = toPlainData(child, childKey, seen);
    }
    if (value instanceof Error) {
      if (value.cause !== undefined) {
        data.cause = toPlainData(value.cause, 'cause', seen);
      }
      if (value.stack) {
        data.stack = redactStack(value.stack);
      }
    }
    return data;
  } finally {
    seen.delete(value);
  }
};

// the full error as JSON, for a bug report
export const serializeError = (error: unknown): string => JSON.stringify(toPlainData(error, '', new WeakSet()), null, 2) ?? String(error);
