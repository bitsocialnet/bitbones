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
  // the name set on the error is its own field: listed once, not numbered as a second name
  assert.deepEqual(Object.keys(copied), ['name', 'message', 'code', 'details', 'cause', 'stack']);
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
  // a message with a line shaped like a frame is still redacted in full, and the real frames are kept
  const multiline = new Error('failed\n    at https://rpc.example/v3/private-token');
  const multilineStack = JSON.parse(serializeError(multiline)).stack;
  assert.doesNotMatch(multilineStack, /private-token/);
  assert.match(multilineStack, /^Error: failed\n {4}at https:\/\/rpc\.example\/\[redacted\]\n\s+at /);
  // the stack keeps the message it was formatted with: a message changed later, to other text or to a prefix of it
  for (const later of ['second', 'first']) {
    const changed = new Error('first https://rpc.example/v3/stale-key');
    void changed.stack;
    changed.message = later;
    assert.doesNotMatch(JSON.parse(serializeError(changed)).stack, /stale-key/);
  }
});

test("a stack keeps only the code locations of the app's own scripts", () => {
  const error = new Error('first');
  error.stack = 'Error: first https://rpc.example/v3/private-token\n    at publish (https://bitbones.app/assets/index-abc.js:1:2345)';
  // node has no location: every web url is redacted (the url pattern of /log takes the closing parenthesis with it)
  assert.equal(JSON.parse(serializeError(error)).stack, 'Error: first https://rpc.example/[redacted]\n    at publish (https://bitbones.app/[redacted]');
  globalThis.location = { origin: 'https://bitbones.app' };
  try {
    assert.equal(
      JSON.parse(serializeError(error)).stack,
      'Error: first https://rpc.example/[redacted]\n    at publish (https://bitbones.app/assets/index-abc.js:1:2345)',
    );
    // a dev server's scripts, with its cache-busting query
    const dev = new Error('dev');
    dev.stack = 'Error: dev\n    at f (https://bitbones.app/node_modules/.vite/deps/react.js?v=1a2b:10:5)\n    at g (https://bitbones.app/src/app.tsx?t=17:3:1)';
    assert.equal(JSON.parse(serializeError(dev)).stack, dev.stack);
    // a url on the app's origin that is not a code location, in the message of the error and of its cause
    const cause = new Error('refused https://bitbones.app/v3/cause-token');
    const sameOrigin = new Error('failed https://bitbones.app/v3/private-token', { cause });
    const copied = JSON.parse(serializeError(sameOrigin));
    assert.doesNotMatch(JSON.stringify(copied), /private-token|cause-token/);
    assert.match(copied.stack, /^Error: failed https:\/\/bitbones\.app\/\[redacted\]\n/);
    assert.match(copied.cause.stack, /^Error: refused https:\/\/bitbones\.app\/\[redacted\]\n/);
    // nor a script url with a query other than the dev server's, or on another origin that starts the same
    for (const url of ['https://bitbones.app/a.js?token=x:1:2', 'https://bitbones.app.example/a.js:1:2']) {
      const other = new Error('other');
      other.stack = `Error: other\n    at f (${url})`;
      assert.doesNotMatch(JSON.parse(serializeError(other)).stack, /token=x|a\.js/);
    }
    // only an Error's own stack: other text keeps no url whole
    assert.equal(JSON.parse(serializeError({ note: 'https://bitbones.app/assets/x.js:1:2' })).note, 'https://bitbones.app/[redacted]');
  } finally {
    delete globalThis.location;
  }
});

test('keys are redacted too, as pkc-js keys errors by endpoint url', () => {
  const error = new Error('Failed to publish');
  error.details = {
    providerToError: {
      'https://user:pass@rpc.example.com/api/v0?token=abc': { message: 'refused' },
    },
    // two urls on one host redact to the same key: neither entry is lost
    gatewayToError: {
      'https://gateway.example/a-key': { message: 'timed out' },
      'https://gateway.example/b-key': { message: 'not found' },
    },
  };
  const copied = serializeError(error);
  assert.doesNotMatch(copied, /user:pass|abc|a-key|b-key/);
  const { details } = JSON.parse(copied);
  assert.deepEqual(Object.keys(details.providerToError), ['https://rpc.example.com/api/v0?[redacted]"[redacted]"']);
  assert.deepEqual(details.gatewayToError, {
    'https://gateway.example/[redacted]': { message: 'timed out' },
    'https://gateway.example/[redacted] (2)': { message: 'not found' },
  });
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
