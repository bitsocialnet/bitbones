import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const wrapper = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../pw-session.sh');

// Stands in for playwright-cli: `open` can be held in its "browser launching" phase until the test
// creates a release file, `list --all` reports opened sessions, and every close is logged.
const fakeCli = `#!/bin/bash
set -eu
state="$FAKE_PW_STATE"
session=''
case "\${1:-}" in -s=*) session="\${1#-s=}"; shift ;; esac
case "\${1:-}" in
  open)
    while [ -f "$state/hold-$session" ] && [ ! -f "$state/go-$session" ]; do sleep 0.05; done
    touch "$state/open-$session"
    ;;
  close)
    echo "$session" >>"$state/closed"
    rm -f "$state/open-$session"
    ;;
  list)
    echo '### Browsers'
    echo '/:'
    for file in "$state"/open-*; do
      [ -e "$file" ] || continue
      printf -- '- %s:\\n  - status: open\\n' "\${file##*/open-}"
    done
    ;;
esac
`;

function fixture(t) {
  const temporary = realpathSync(mkdtempSync(path.join(tmpdir(), 'pw-session-test-')));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const state = path.join(temporary, 'state');
  mkdirSync(state);
  const cli = path.join(temporary, 'playwright-cli');
  writeFileSync(cli, fakeCli, { mode: 0o755 });
  const lock = path.join(temporary, 'lock');
  const workspace = (name) => {
    const directory = path.join(temporary, name);
    mkdirSync(directory, { recursive: true });
    return directory;
  };
  // Without Git the wrapper records the working directory as the workspace.
  const env = { ...process.env, PLAYWRIGHT_CLI_BIN: cli, PLAYWRIGHT_RESOURCE_LOCK_DIR: lock, FAKE_PW_STATE: state, GIT_CEILING_DIRECTORIES: temporary };
  const run = (cwd, ...args) => spawnSync('bash', [wrapper, ...args], { cwd, env, encoding: 'utf8' });
  const start = (cwd, ...args) => {
    const child = spawn('bash', [wrapper, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const exited = new Promise((resolve) => child.on('exit', (status) => resolve({ status, output })));
    t.after(() => child.kill('SIGKILL'));
    return { child, exited };
  };
  const owner = () => (existsSync(path.join(lock, 'owner')) ? readFileSync(path.join(lock, 'owner'), 'utf8').split('\n')[0] : null);
  const closed = () => (existsSync(path.join(state, 'closed')) ? readFileSync(path.join(state, 'closed'), 'utf8').trim().split('\n') : []);
  return { state, lock, workspace, run, start, owner, closed };
}

async function waitFor(predicate, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test('a second open does not reclaim the slot while the first browser is still launching', async (t) => {
  const { state, workspace, run, start, owner } = fixture(t);
  const directory = workspace('repo');
  writeFileSync(path.join(state, 'hold-first'), '');

  const first = start(directory, 'open', 'first', 'about:blank');
  await waitFor(() => owner() === 'first', 'the first opener to take the slot');

  const second = run(directory, 'open', 'second', 'about:blank');
  assert.equal(second.status, 75, second.stdout + second.stderr);
  assert.equal(owner(), 'first');

  writeFileSync(path.join(state, 'go-first'), '');
  const opened = await first.exited;
  assert.equal(opened.status, 0, opened.output);
  assert.equal(owner(), 'first');
  assert.equal(run(directory, 'open', 'third', 'about:blank').status, 75, 'a launched browser keeps the slot');

  assert.equal(run(directory, 'close', 'first').status, 0);
  assert.equal(existsSync(path.join(state, 'open-first')), false);
});

test('a lock whose owner file is not written yet is not reclaimed at once', async (t) => {
  const { lock, workspace, start, owner } = fixture(t);
  const directory = workspace('repo');
  // A holder between `mkdir` and writing its metadata: the opener is alive (this test process).
  mkdirSync(lock);

  const second = start(directory, 'open', 'second', 'about:blank');
  await new Promise((resolve) => setTimeout(resolve, 300));
  writeFileSync(path.join(lock, 'owner'), `first\n${process.pid}\n`);

  const result = await second.exited;
  assert.equal(result.status, 75, result.output);
  assert.equal(owner(), 'first');
});

test('an abandoned ownerless lock and a dead launcher are still reclaimed', (t) => {
  const { lock, workspace, run, owner } = fixture(t);
  const directory = workspace('repo');
  mkdirSync(lock);
  const reclaimedOwnerless = run(directory, 'open', 'second', 'about:blank');
  assert.equal(reclaimedOwnerless.status, 0, reclaimedOwnerless.stdout + reclaimedOwnerless.stderr);
  assert.equal(owner(), 'second');

  rmSync(lock, { recursive: true });
  mkdirSync(lock);
  const finished = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' });
  writeFileSync(path.join(lock, 'owner'), `first\n${finished.stdout.trim()}\n`);
  const reclaimedLauncher = run(directory, 'open', 'third', 'about:blank');
  assert.equal(reclaimedLauncher.status, 0, reclaimedLauncher.stdout + reclaimedLauncher.stderr);
  assert.equal(owner(), 'third');
});
