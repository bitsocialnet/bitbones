import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const browserModule = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../react-perf/browser.mjs')).href;

// Stands in for scripts/pw-session.sh: `open` succeeds at once (no browser listens, so the CDP
// connect fails and withBrowser goes straight to cleanup), `close` takes a second and leaves a
// marker only when it runs to completion.
const fakeWrapper = `#!/bin/bash
state="$FAKE_WRAPPER_STATE"
case "$1" in
  open) echo "opened $2" ;;
  close)
    touch "$state/close-started"
    sleep 1
    touch "$state/close-finished"
    echo "closed $2"
    ;;
esac
`;

test('a Ctrl-C that reaches the whole process group does not kill the cleanup close', async (t) => {
  const temporary = realpathSync(mkdtempSync(path.join(tmpdir(), 'react-perf-browser-test-')));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const repo = path.join(temporary, 'repo');
  const state = path.join(temporary, 'state');
  mkdirSync(path.join(repo, 'scripts'), { recursive: true });
  mkdirSync(state);
  writeFileSync(path.join(repo, 'scripts/pw-session.sh'), fakeWrapper, { mode: 0o755 });
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo }).status, 0);

  // The runner ignores repeated interrupts itself; its own process group stands in for the
  // terminal's foreground group.
  const source = `const { withBrowser } = await import(${JSON.stringify(browserModule)});
process.on('SIGINT', () => console.log('interrupted'));
try {
  await withBrowser(${JSON.stringify(repo)}, false, async () => {});
} catch (error) {
  console.log('withBrowser failed: ' + error.message);
}`;
  const runner = spawn(process.execPath, ['--input-type=module', '-e', source], {
    env: { ...process.env, FAKE_WRAPPER_STATE: state, REACT_PERF_BROWSER_CHANNEL: 'chrome' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let output = '';
  runner.stdout.on('data', (chunk) => (output += chunk));
  runner.stderr.on('data', (chunk) => (output += chunk));
  const exited = new Promise((resolve) => runner.on('exit', resolve));
  t.after(() => {
    try {
      process.kill(-runner.pid, 'SIGKILL');
    } catch {
      /* Already gone. */
    }
  });

  for (let attempt = 0; !existsSync(path.join(state, 'close-started')) && attempt < 200; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(existsSync(path.join(state, 'close-started')), `cleanup never ran the wrapper close:\n${output}`);

  process.kill(-runner.pid, 'SIGINT');
  await exited;
  assert.ok(existsSync(path.join(state, 'close-finished')), `the interrupt killed the wrapper close:\n${output}`);
});
