// Run with: node --test scripts/__tests__/error-utils.node-test.mjs
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// error-utils imports the redaction helpers by relative path, so it is bundled with esbuild first
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { outputFiles } = await build({
  entryPoints: [path.join(root, 'src/lib/error-utils.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
});
const { formatError, serializeError } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

// a PKC error carries a code and details as own fields, and the cause of the failure it wraps
const pkcError = () => {
  const cause = new TypeError('fetch failed');
  const error = new Error('Failed to resolve the community address', { cause });
  error.name = 'PKCError';
  error.code = 'ERR_FAILED_TO_RESOLVE_COMMUNITY';
  error.details = { communityAddress: 'example.bso', chainProviderUrl: 'https://rpc.example/v3/abcdef', attempts: 3n };
  return error;
};

test('the copied error keeps what an alert dropped: code, details, cause and stack', () => {
  const copied = JSON.parse(serializeError(pkcError()));
  assert.equal(copied.name, 'PKCError');
  assert.equal(copied.message, 'Failed to resolve the community address');
  assert.equal(copied.code, 'ERR_FAILED_TO_RESOLVE_COMMUNITY');
  assert.equal(copied.details.communityAddress, 'example.bso');
  assert.equal(copied.details.attempts, '3');
  assert.equal(copied.cause.name, 'TypeError');
  assert.equal(copied.cause.message, 'fetch failed');
  assert.match(copied.stack, /^PKCError: Failed to resolve/);
  assert.match(copied.cause.stack, /^TypeError: fetch failed/);
});

test('the copied error redacts endpoint credentials and secret fields, as /log does', () => {
  const error = pkcError();
  error.details.headers = { authorization: 'Bearer abc' };
  error.details.signer = { privateKey: 'c2VjcmV0' };
  error.details.note = 'called https://user:pass@rpc.example/key123?apikey=1';
  const copied = serializeError(error);
  assert.doesNotMatch(copied, /abcdef|Bearer abc|c2VjcmV0|user:pass|key123|apikey=1/);
  const details = JSON.parse(copied).details;
  assert.equal(details.chainProviderUrl, 'https://rpc.example/[redacted]');
  assert.equal(details.headers, '[redacted]');
  assert.equal(details.signer.privateKey, '[redacted]');
});

test('a circular error is copied without throwing', () => {
  const error = new Error('loop');
  error.details = { error };
  assert.equal(JSON.parse(serializeError(error)).details.error, '[circular]');
});

test('the shown message is the alert text, with urls redacted', () => {
  assert.equal(formatError(pkcError()), 'PKCError: Failed to resolve the community address');
  assert.equal(formatError(new Error('timed out on https://rpc.example/secret-key')), 'Error: timed out on https://rpc.example/[redacted]');
  assert.equal(formatError('plain text'), 'plain text');
});
