// Run with: node --test --experimental-test-module-mocks scripts/__tests__/electron-start-ipfs.node-test.mjs
// electron/start-ipfs.js runs in plain Node once its Electron-only imports are mocked; a shell script stands in for kubo.
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, mock, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getBundledKuboPath } from '../../electron/kubo-paths.js';

if (typeof mock.module !== 'function') {
  throw new Error('run this file with node --test --experimental-test-module-mocks');
}

const startIpfsUrl = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../electron/start-ipfs.js')).href;
const temporary = mkdtempSync(path.join(tmpdir(), 'bitbones-start-ipfs-test-'));
after(() => rmSync(temporary, { recursive: true, force: true }));

// packaged mode: kubo comes from resources/app.asar.unpacked/bin and the repo from the data path
process.resourcesPath = path.join(temporary, 'resources');
const kuboPath = getBundledKuboPath(path.join(process.resourcesPath, 'app.asar.unpacked'));
mkdirSync(path.dirname(kuboPath), { recursive: true });
const ipfsDataPath = path.join(temporary, 'data', 'ipfs');
const daemonPidPath = path.join(ipfsDataPath, 'daemon.pid');

const port = { used: false };
mock.module('electron-is-dev', { defaultExport: false });
mock.module('env-paths', { defaultExport: () => ({ data: path.join(temporary, 'data') }) });
mock.module('tcp-port-used', { defaultExport: { check: async () => port.used } });

// kubo is spawned with only IPFS_PATH in its env, so the scripts use builtins and absolute paths
const kubo = {
  healthy: `#!/bin/sh
if [ "$1" = daemon ]; then
  echo $$ > "$IPFS_PATH/daemon.pid"
  echo 'Daemon is ready'
  exec /bin/sleep 60
fi
exit 0
`,
  daemonExits: `#!/bin/sh
if [ "$1" = daemon ]; then
  echo 'Error: address already in use' >&2
  exit 1
fi
exit 0
`,
  // setup succeeds, then the binary loses its exec bit right before the daemon is spawned
  daemonCannotSpawn: `#!/bin/sh
if [ "$1" = config ] && [ "$2" = Addresses.API ]; then
  /bin/chmod 644 "$0"
fi
exit 0
`,
};
// the pid the fake daemon wrote, or 0 before it wrote one
const daemonPid = () => (existsSync(daemonPidPath) ? Number(readFileSync(daemonPidPath, 'utf8')) || 0 : 0);
const installKubo = (script, { executable = true } = {}) => {
  rmSync(daemonPidPath, { force: true });
  writeFileSync(kuboPath, script);
  chmodSync(kuboPath, executable ? 0o755 : 0o644);
};

const waitFor = async (condition, what, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      assert.fail(`timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

let caseId = 0;
// loads a fresh copy of the module; its first start is skipped so every attempt below is driven by tick()
const loadStartIpfs = async (t) => {
  const exitListenersBefore = process.listeners('exit');
  const quitHandlers = () => process.listeners('exit').filter((listener) => !exitListenersBefore.includes(listener));
  const realKill = process.kill.bind(process);
  t.after(() => {
    // the module's quit handlers must never run for real in the test process
    for (const listener of quitHandlers()) {
      process.removeListener('exit', listener);
    }
    mock.timers.reset();
    if (daemonPid() > 0) {
      try {
        realKill(daemonPid(), 'SIGKILL');
      } catch {
        /* Already gone. */
      }
    }
  });

  mock.timers.enable({ apis: ['setInterval'] });
  port.used = true;
  const { default: startIpfs } = await import(`${startIpfsUrl}?case=${++caseId}`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  port.used = false;

  const errors = [];
  let started = 0;
  startIpfs.onError = (error) => errors.push(error);
  startIpfs.onStarted = () => started++;
  return {
    errors,
    started: () => started,
    attempt: () => mock.timers.tick(1000),
    // runs what the module registered for app quit, recording the pids it signals instead of signalling them
    quit: () => {
      const kill = mock.method(process, 'kill', () => true);
      try {
        for (const listener of quitHandlers()) {
          listener(0);
        }
        return kill.mock.calls.map((call) => call.arguments[0]);
      } finally {
        kill.mock.restore();
      }
    },
  };
};

test('a kubo binary that cannot be spawned reaches onError, and the next attempt retries', async (t) => {
  const ipfs = await loadStartIpfs(t);
  installKubo(kubo.healthy, { executable: false });
  ipfs.attempt();
  await waitFor(() => ipfs.errors.length === 1, 'onError after a spawn error');
  assert.equal(ipfs.errors[0].code, 'EACCES');

  installKubo(kubo.healthy);
  ipfs.attempt();
  await waitFor(() => daemonPid() > 0, 'the retry to start the daemon');
});

test('a daemon spawn error reaches onError', async (t) => {
  const ipfs = await loadStartIpfs(t);
  installKubo(kubo.daemonCannotSpawn);
  ipfs.attempt();
  await waitFor(() => ipfs.errors.length === 1, 'onError after the daemon spawn error');
  assert.equal(ipfs.errors[0].code, 'EACCES');
});

test('daemons that already exited are not signalled when the app quits', async (t) => {
  const ipfs = await loadStartIpfs(t);
  installKubo(kubo.daemonExits);
  for (let attempt = 1; attempt <= 3; attempt++) {
    ipfs.attempt();
    await waitFor(() => ipfs.errors.length === attempt, `daemon exit ${attempt}`);
  }
  assert.match(ipfs.errors[2].message, /address already in use/);
  assert.deepEqual(ipfs.quit(), []);
});

test('quitting signals only the running daemon, not its pid + 1', async (t) => {
  const ipfs = await loadStartIpfs(t);
  installKubo(kubo.healthy);
  ipfs.attempt();
  await waitFor(() => daemonPid() > 0, 'the daemon pid');
  assert.deepEqual(ipfs.quit(), [daemonPid()]);
});

test('onStarted fires once ipfs runs, whether this client or another one started it', async (t) => {
  const ipfs = await loadStartIpfs(t);
  installKubo(kubo.healthy);
  ipfs.attempt();
  await waitFor(() => ipfs.started() === 1, 'onStarted after the daemon is ready');

  port.used = true;
  ipfs.attempt();
  await waitFor(() => ipfs.started() === 2, 'onStarted while the api port is in use');
  assert.deepEqual(ipfs.errors, []);
});
