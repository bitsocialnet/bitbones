// `yarn electron:dev` — plain Vite on a free port, then Electron loading that exact url.
//
// The port starts at 5173 and moves up when taken, so with another checkout already serving 5173
// the Electron window still shows this checkout's app. PORT pins the port instead, and a busy one
// then fails rather than moving.

import { spawn } from 'node:child_process';

// Read by local-server-utils when it loads. Electron needs a plain http url, and no browser tab.
process.env.PORTLESS = '0';
process.env.BROWSER = 'none';
const { repoRoot, resolveLocalServer, startLocalServer, waitForUrlReady } = await import('./local-server-utils.mjs');

const server = await resolveLocalServer([], 5173);
// exits this process when Vite exits, e.g. when the port was taken after it was picked
const vite = startLocalServer(server);

const isWindows = process.platform === 'win32';
let electron;
// `yarn electron` is a chain of processes (yarn, electron-forge, Electron), so it runs in its own
// process group and the whole group is stopped. 'exit' also runs when a signal forwarded to Vite
// ends this process.
process.on('exit', () => {
  if (!electron?.pid) return;
  try {
    if (isWindows) electron.kill();
    else process.kill(-electron.pid, 'SIGTERM');
  } catch {
    /* Already gone. */
  }
});

await waitForUrlReady(server.url, 60_000);
electron = spawn('yarn', ['electron'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: { ...process.env, BITBONES_DEV_SERVER_URL: server.url },
  shell: isWindows,
  detached: !isWindows,
});
// closing the Electron app ends the dev session: stopping Vite also ends this process
electron.on('exit', () => vite.kill('SIGTERM'));
