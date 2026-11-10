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
  t.after(() => child.kill('SIGKILL'));
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
