import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const utils = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../local-server-utils.mjs')).href;

// The launcher reads PORTLESS and PORT when it loads, so each case runs in its own process.
function runLauncher(t, source, env = {}) {
  const childEnv = { ...process.env, PORTLESS: '0', ...env };
  if (!('PORT' in env)) delete childEnv.PORT;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `const utils = await import(${JSON.stringify(utils)});\n${source}`], {
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Its own process group, so cleanup also stops a child the launcher left behind.
    detached: true,
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal, output })));
  const line = (pattern) =>
    new Promise((resolve, reject) => {
      const check = () => {
        const match = output.match(pattern);
        if (match) resolve(match);
      };
      child.stdout.on('data', check);
      child.on('exit', () => reject(new Error(`launcher exited before printing ${pattern}:\n${output}`)));
      check();
    });
  t.after(() => {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      /* Already gone. */
    }
  });
  return { child, exited, line };
}

async function holdLoopbackPort(t) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => server.close());
  return server.address().port;
}

const resolvedPort = (t, port, env) =>
  runLauncher(t, `const server = await utils.resolveLocalServer([], ${port});\nconsole.log('port=' + server.args[server.args.indexOf('--port') + 1]);`, env)
    .line(/port=(\d+)/)
    .then((match) => Number(match[1]));

test('the direct-Vite fallback skips a port that is already bound on 127.0.0.1', async (t) => {
  const port = await holdLoopbackPort(t);
  assert.notEqual(await resolvedPort(t, port), port);
});

test('an explicit PORT is used as given, so a busy one fails instead of moving', async (t) => {
  const port = await holdLoopbackPort(t);
  assert.equal(await resolvedPort(t, port + 1, { PORT: String(port) }), port);
});

// Starts `server` (a Node script that prints `server pid=<pid>`) through startLocalServer and
// returns the launcher plus a check that waits up to a second for that server PID to be gone.
async function launchServer(t, server) {
  const launcher = runLauncher(t, `utils.startLocalServer({ command: process.execPath, args: ['-e', ${JSON.stringify(server)}], env: process.env, publicUrl: null });`);
  const serverPid = Number((await launcher.line(/server pid=(\d+)/))[1]);
  const alive = () => {
    try {
      process.kill(serverPid, 0);
      return true;
    } catch {
      return false;
    }
  };
  t.after(() => alive() && process.kill(serverPid, 'SIGKILL'));
  const stopped = async () => {
    for (let attempt = 0; alive() && attempt < 50; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    return !alive();
  };
  return { launcher, stopped };
}

test('terminating the launcher by PID also stops the server it started', async (t) => {
  const { launcher, stopped } = await launchServer(t, `console.log('server pid=' + process.pid); setInterval(() => {}, 1000);`);

  launcher.child.kill('SIGTERM');
  const { signal } = await launcher.exited;
  assert.equal(await stopped(), true, 'the server outlived its launcher');
  assert.equal(signal, 'SIGTERM');
});

// Like portless: handles only SIGINT and SIGTERM, and runs the real server in its own process group.
const portlessLike = `
const { spawn } = require('node:child_process');
const server = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { process.kill(-server.pid, signal); process.exit(143); });
console.log('server pid=' + server.pid);
setInterval(() => {}, 1000);
`;

test('a hangup sent to the launcher also stops a server run behind portless', async (t) => {
  const { launcher, stopped } = await launchServer(t, portlessLike);

  launcher.child.kill('SIGHUP');
  await launcher.exited;
  assert.equal(await stopped(), true, 'the server behind the portless-like child outlived its launcher');
});
