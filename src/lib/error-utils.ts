import { isSecretKey, redactSecrets } from './redact-secrets';

// What a native alert(error) printed: "Name: message". Endpoint urls and secret fields are redacted.
export const formatError = (error: unknown): string => redactSecrets(error instanceof Error ? error.toString() : String(error));

// A stack repeats the error's message, which can hold a secret, and where the message ends can't be told
// reliably: it can have lines shaped like frames, and the stack keeps the message it was formatted with.
// So the whole stack is redacted, except urls on the app's own origin, which are the frames' code
// locations. Frames of the desktop app (file://) and of node are not web urls and stay as they are.
const redactStack = (stack: string): string => redactSecrets(stack, globalThis.location?.origin);

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
