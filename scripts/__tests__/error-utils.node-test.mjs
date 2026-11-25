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

test('a secret in the message is redacted where the stack repeats it, and the frames are kept', () => {
  const cause = new Error('refused by https://rpc.example/cause-key');
  const error = new Error('timed out on https://rpc.example/secret-key with token=abc123', { cause });
  // only an Error's own stack keeps its frames: a field named stack anywhere else is ordinary text
  error.details = { stack: 'Error: copied from https://rpc.example/nested-key' };
  const copied = serializeError(error);
  assert.doesNotMatch(copied, /secret-key|abc123|cause-key|nested-key/);
  const data = JSON.parse(copied);
  assert.match(data.stack, /^Error: timed out on https:\/\/rpc\.example\/\[redacted\] with token="\[redacted\]"\n\s+at /);
  assert.match(data.cause.stack, /^Error: refused by https:\/\/rpc\.example\/\[redacted\]\n\s+at /);
  assert.equal(data.details.stack, 'Error: copied from https://rpc.example/[redacted]');
  // a stack without V8 frames is redacted whole
  const firefoxStyle = new Error('failed on https://rpc.example/ff-key');
  firefoxStyle.stack = 'publish@https://bitbones.app/assets/index.js:1:2\n';
  assert.equal(JSON.parse(serializeError(firefoxStyle)).stack, 'publish@https://bitbones.app/[redacted]\n');
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
