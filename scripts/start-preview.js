// `yarn start:preview` — builds for production, then serves build/ with `vite preview` through the
// same portless-or-plain-port path as `yarn start`.
//
// Use this, not `yarn start`, to judge bundle size and runtime performance: the dev server ships
// unbundled modules and a development React build, so it says nothing about the real thing.

import { spawnSync } from 'node:child_process';
import { repoRoot, resolveLocalServer, startLocalServer } from './local-server-utils.mjs';

console.log('Building production preview with corepack yarn build...');

const build = spawnSync('corepack', ['yarn', 'build'], { cwd: repoRoot, env: process.env, stdio: 'inherit' });

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

startLocalServer(await resolveLocalServer(['preview'], 4173));
