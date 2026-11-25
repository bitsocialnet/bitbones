import { isSecretKey, redactSecrets } from './redact-secrets';

// What a native alert(error) printed: "Name: message". Endpoint urls and secret fields are redacted.
export const formatError = (error: unknown): string => redactSecrets(error instanceof Error ? error.toString() : String(error));

// A V8 stack opens with the error's "Name: message", which can hold a secret, and goes on with frames,
// which are code locations that redacting their urls would drop. The header is matched as the exact
// text of the error, not up to the first "at" line, since a message can have lines of that shape too.
// A stack that does not open with it (another engine, or a message changed later) is redacted whole.
const redactStack = (error: Error, stack: string): string => {
  const header = String(error);
  return stack.startsWith(header) ? `${redactSecrets(header)}${stack.slice(header.length)}` : redactSecrets(stack);
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
        data.stack = redactStack(value, value.stack);
      }
    }
    return data;
  } finally {
    seen.delete(value);
  }
};

// the full error as JSON, for a bug report
export const serializeError = (error: unknown): string => JSON.stringify(toPlainData(error, '', new WeakSet()), null, 2) ?? String(error);
