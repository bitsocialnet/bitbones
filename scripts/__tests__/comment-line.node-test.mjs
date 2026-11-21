// Run with: node --test scripts/__tests__/comment-line.node-test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// CommentLine is TSX, so it is bundled with esbuild and rendered to markup. The protocol hooks are
// stubbed: useAccountComment returns the account comments a test sets, by account index.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const stubs = {
  name: 'stubs',
  setup(build) {
    build.onResolve({ filter: /^@bitsocial\/bitsocial-react-hooks$/ }, () => ({ path: 'hooks', namespace: 'stub' }));
    build.onLoad({ filter: /^hooks$/, namespace: 'stub' }, () => ({
      contents: `
        export const accountComments = {};
        export const useAccountComment = (options) => (options && accountComments[options.commentIndex]) || { state: 'initializing' };
        export const useClientsStates = () => ({ states: {}, peers: {} });`,
      loader: 'js',
    }));
    // a css module maps each class name to itself
    build.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: 'export default new Proxy({}, { get: (_, name) => name });', loader: 'js' }));
  },
};
const { outputFiles } = await build({
  stdin: {
    contents: `
      export { CommentLine } from './src/components/protocol-details/protocol-details.tsx';
      export { accountComments } from '@bitsocial/bitsocial-react-hooks';
      export { createElement } from 'react';
      export { renderToStaticMarkup } from 'react-dom/server';`,
    resolveDir: root,
    loader: 'js',
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  jsx: 'automatic',
  logLevel: 'silent',
  plugins: [stubs],
});
const bundle = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(bundle, bundle.exports, createRequire(import.meta.url));
const { CommentLine, accountComments, createElement, renderToStaticMarkup } = bundle.exports;

// the line's parts by name, e.g. { cid: 'pending #3', updatedAt: 'none yet' }
const getLineParts = (props) => {
  const markup = renderToStaticMarkup(createElement(CommentLine, props));
  return Object.fromEntries([...markup.matchAll(/<span class="part"><span class="dim">([^<]+)<\/span> ([^<]*)<\/span>/g)].map(([, name, value]) => [name, value]));
};

const timestamp = Math.round(Date.now() / 1000);

test("the account's own comment whose publication failed is failed, not pending", () => {
  // a feed or reply row holds a snapshot of the account comment, whose state is pkc-js's publication state
  const snapshot = { index: 3, timestamp, protocolVersion: '1.0.0', state: 'publishing' };
  accountComments[3] = { ...snapshot, state: 'failed', publishingState: 'failed' };
  const parts = getLineParts({ comment: snapshot });
  assert.equal(parts.cid, 'failed #3');
  // a failed publication never gets a CommentUpdate
  assert.equal(parts.updatedAt, 'none');
  // the pending post page passes the useAccountComment result itself
  assert.equal(getLineParts({ comment: accountComments[3] }).cid, 'failed #3');
});

test("the account's own comment that is still publishing is pending", () => {
  const snapshot = { index: 4, timestamp, state: 'publishing' };
  accountComments[4] = { ...snapshot, state: 'pending' };
  const parts = getLineParts({ comment: snapshot });
  assert.equal(parts.cid, 'pending #4');
  assert.equal(parts.updatedAt, 'none yet');
});

test('a published comment shows its cid and the age of its update', () => {
  const comment = { cid: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG', index: 5, timestamp, updatedAt: timestamp - 60 };
  const parts = getLineParts({ comment });
  assert.equal(parts.cid, 'QmYwAP…PbdG');
  assert.equal(parts.updatedAt, '1m ago');
  assert.equal(getLineParts({ comment: { ...comment, updatedAt: undefined } }).updatedAt, 'none yet');
});

test('a comment that failed to load before it had a cid has no cid part', () => {
  const parts = getLineParts({ comment: { state: 'failed' } });
  assert.equal(parts.cid, undefined);
  assert.equal(parts.updatedAt, 'none yet');
});
