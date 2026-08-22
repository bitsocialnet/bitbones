// Deletes the local PKC node data used by `yarn electron` in development.
//
// In development electron/main.js and electron/start-pkc-rpc.js both put the node's data in
// <repo>/.pkc (in a packaged app it lives in the OS data dir instead, which this never touches).
// Wiping it between runs is what makes `yarn electron` a cold start.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(repoRoot, '.pkc');

console.log(`Removing local PKC data path: ${dataPath}`);
fs.rmSync(dataPath, { recursive: true, force: true });
