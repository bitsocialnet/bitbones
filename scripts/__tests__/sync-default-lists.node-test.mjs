import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../sync-default-lists.js');

// Serves canned responses by URL suffix; anything unlisted is a 404.
const fetchStub = `
const routes = JSON.parse(process.env.FAKE_FETCH_ROUTES);
globalThis.fetch = async (url) => {
  const suffix = Object.keys(routes).find((candidate) => String(url).endsWith(candidate));
  const route = suffix ? routes[suffix] : { status: 404 };
  return new Response(JSON.stringify(route.body ?? null), { status: route.status ?? 200 });
};
`;

const existingMirror = { source: '5chan', revision: 1, communities: [{ address: 'old.bso', title: 'Old', directoryCode: 'b' }] };

// The script writes to ../src/data next to itself, so run a copy inside a scratch tree.
function sync(t, directoryRoutes) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'sync-default-lists-test-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'scripts'));
  mkdirSync(path.join(root, 'src', 'data'), { recursive: true });
  writeFileSync(path.join(root, 'package.json'), '{ "type": "module" }\n');
  copyFileSync(script, path.join(root, 'scripts', 'sync-default-lists.js'));
  writeFileSync(path.join(root, 'fetch-stub.mjs'), fetchStub);
  const mirror = path.join(root, 'src', 'data', 'vendored-5chan-defaults.json');
  writeFileSync(mirror, JSON.stringify(existingMirror, undefined, 2) + '\n');

  const routes = {
    'seedit-default-subscriptions.json': { body: { revision: 1, communities: [{ address: 'seedit.bso', title: 'Seedit' }] } },
    '5chan-directories-defaults.json': { body: { updatedAt: 2, directories: { b: { title: 'Random' }, g: { title: 'Technology' } } } },
    '5chan-b-directory.json': { body: { boards: [{ address: 'random.bso', score: 1 }] } },
    ...directoryRoutes,
  };
  const result = spawnSync(process.execPath, ['--import', path.join(root, 'fetch-stub.mjs'), path.join(root, 'scripts', 'sync-default-lists.js')], {
    env: { ...process.env, FAKE_FETCH_ROUTES: JSON.stringify(routes) },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return { output: result.stdout + result.stderr, mirror: JSON.parse(readFileSync(mirror, 'utf8')) };
}

test('a directory fetch that fails transiently keeps the existing 5chan mirror', (t) => {
  const { output, mirror } = sync(t, { '5chan-g-directory.json': { status: 503 } });
  assert.deepEqual(mirror, existingMirror);
  assert.match(output, /keeping the existing mirror/);
});

test('a directory whose candidate file is not merged yet is still skipped', (t) => {
  const { mirror } = sync(t, {});
  assert.equal(mirror.revision, 2);
  assert.deepEqual(
    mirror.communities.map((community) => community.address),
    ['random.bso'],
  );
});
