// Shared machinery for `yarn start` (scripts/start-dev.js) and `yarn start:preview`
// (scripts/start-preview.js).
//
// Both wrap Vite in `portless`, which fronts the server with an https reverse proxy on
// <app>.localhost so there is no port to remember and no collision between two checkouts of the
// repo. portless is an optionalDependency and its proxy needs :443 (so, sudo once per boot), so
// every step degrades to plain Vite on a free port instead of failing: missing binary, PORTLESS=0,
// Windows, or a proxy that would not start.
//
// Ported from 5chan/scripts/local-server-utils.mjs. The port probe lives here rather than in a
// separate dev-server-utils module (bitbones has no e2e runners to share it with), the app label
// comes from package.json instead of a hardcoded name, and a failed proxy start falls back rather
// than exiting.

import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const isWindows = process.platform === 'win32';
// portless binds :443 and edits /etc/hosts, neither of which works the same way on Windows
const usePortless = process.env.PORTLESS !== '0' && !isWindows;
const binDir = join(repoRoot, 'node_modules', '.bin');
const executableSuffix = isWindows ? '.cmd' : '';
const portlessBin = join(binDir, `portless${executableSuffix}`);
const viteBin = join(binDir, `vite${executableSuffix}`);
const fallbackHost = '127.0.0.1';
const fallbackUrlHost = 'localhost';
const portlessProxyPort = process.env.PORTLESS_PORT || '443';
const portlessEnv = {
  ...process.env,
  PORTLESS_PORT: portlessProxyPort,
  PORTLESS_HTTPS: process.env.PORTLESS_HTTPS ?? '1',
  PORTLESS_LAN: process.env.PORTLESS_LAN ?? '0',
};

// The portless route is named after the package, so `yarn start` lands on https://bitbones.localhost
const appLabel = sanitizeLabel(JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).name);

function sanitizeLabel(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port);
  });
}

async function resolvePort(requestedPort) {
  let port = requestedPort;
  while (!(await checkPort(port))) {
    port += 1;
  }
  return port;
}

function getCurrentBranch() {
  const result = spawnSync('git', ['branch', '--show-current'], { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim() || null;
}

function getActivePortlessRouteHosts() {
  const result = spawnSync(portlessBin, ['list'], { cwd: repoRoot, encoding: 'utf8', env: process.env });
  if (result.status !== 0) {
    return new Set();
  }
  const matches = result.stdout.match(/https?:\/\/[a-z0-9.-]+\.localhost(?::\d+)?/g) || [];
  return new Set(matches.map((url) => new URL(url).hostname));
}

function isRouteBusy(activeRouteHosts, appName) {
  return activeRouteHosts.has(`${appName}.localhost`);
}

// A checkout on a feature branch gets its own <branch>.bitbones route so two worktrees can serve at
// once; master keeps the bare name unless something already holds it.
function getPreferredPortlessAppName(activeRouteHosts) {
  const branch = getCurrentBranch();
  const branchLabel = sanitizeLabel(branch || 'current');

  if (branch && branch !== 'master' && branch !== 'main') {
    return `${branchLabel}.${appLabel}`;
  }
  if (isRouteBusy(activeRouteHosts, appLabel)) {
    return `${branchLabel}.${appLabel}`;
  }
  return appLabel;
}

function getPortlessAppName() {
  const activeRouteHosts = getActivePortlessRouteHosts();
  const preferredAppName = getPreferredPortlessAppName(activeRouteHosts);

  if (!isRouteBusy(activeRouteHosts, preferredAppName)) {
    return preferredAppName;
  }
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${preferredAppName}-${suffix}`;
    if (!isRouteBusy(activeRouteHosts, candidate)) {
      return candidate;
    }
  }
  return `${preferredAppName}-${Date.now()}`;
}

// Returns false instead of exiting: on a machine where sudo is unavailable the proxy cannot bind
// :443, and a dev server on a plain port is far more useful than no dev server.
function startPortlessProxy() {
  const result = spawnSync(portlessBin, ['proxy', 'start', '--port', portlessProxyPort, '--https'], {
    cwd: repoRoot,
    env: portlessEnv,
    stdio: 'inherit',
  });
  return result.status === 0;
}

/**
 * Picks portless or plain Vite and builds the command line for either.
 * @param {string[]} viteArgs extra Vite arguments, e.g. ['preview']
 * @param {number} fallbackPort port to try first when portless is not used
 */
export async function resolveLocalServer(viteArgs, fallbackPort) {
  const requestedPort = Number(process.env.PORT) || fallbackPort;

  if (usePortless && existsSync(portlessBin) && startPortlessProxy()) {
    const appName = getPortlessAppName();
    return {
      command: portlessBin,
      args: [appName, 'vite', ...viteArgs],
      env: portlessEnv,
      publicUrl: `https://${appName}.localhost`,
    };
  }

  const port = await resolvePort(requestedPort);
  const url = `http://${fallbackUrlHost}:${port}`;

  if (usePortless) {
    console.warn(`portless is unavailable, serving with vite directly on ${url}`);
  } else {
    console.log(`Starting vite directly at ${url}`);
  }
  if (port !== requestedPort) {
    console.log(`Preferred port ${requestedPort} is busy, so this run will use ${url}.`);
  }

  return {
    command: viteBin,
    args: [...viteArgs, '--host', fallbackHost, '--port', String(port), '--strictPort'],
    env: process.env,
    // no auto-open: Vite already prints and opens the local url itself in this mode
    publicUrl: null,
  };
}

/** Spawns the resolved server, opens the portless url once it answers, and mirrors its exit code. */
export function startLocalServer({ command, args, env, publicUrl }) {
  if (publicUrl) {
    console.log(`Serving at ${publicUrl}`);
  }

  const child = spawn(command, args, { cwd: repoRoot, stdio: 'inherit', env });

  if (publicUrl && process.env.BROWSER !== 'none') {
    waitForUrlReady(publicUrl, 30_000)
      .then(() => {
        console.log(`Opening ${publicUrl} in browser...`);
        openInBrowser(publicUrl);
      })
      .catch((error) => {
        console.warn(`Could not auto-open ${publicUrl}: ${error.message}`);
      });
  }

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  return child;
}

async function waitForUrlReady(url, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const ready = await new Promise((resolve) => {
      const parsedUrl = new URL(url);
      const get = parsedUrl.protocol === 'https:' ? httpsGet : httpGet;
      const onResponse = (response) => {
        response.resume();
        const statusCode = response.statusCode ?? 500;
        resolve(statusCode >= 200 && statusCode < 400);
      };
      // portless serves a locally generated certificate, so skip verification
      const request = parsedUrl.protocol === 'https:' ? get(parsedUrl, { rejectUnauthorized: false }, onResponse) : get(parsedUrl, onResponse);

      request.on('error', () => resolve(false));
      request.setTimeout(2_000, () => {
        request.destroy();
        resolve(false);
      });
    });

    if (ready) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function openInBrowser(url) {
  const opener =
    process.platform === 'darwin' ? { cmd: 'open', args: [url] } : isWindows ? { cmd: 'cmd', args: ['/c', 'start', '""', url] } : { cmd: 'xdg-open', args: [url] };

  spawn(opener.cmd, opener.args, { stdio: 'ignore', detached: true }).unref();
}
