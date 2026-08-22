// Loads the native modules the packaged app depends on inside Electron itself, so an ABI mismatch
// fails here (fast, with a stack trace) instead of at first launch of a shipped build.
//
// Run after `electron-rebuild` via `yarn electron:prepare-package`.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');

if (typeof electronBinary !== 'string' || electronBinary.length === 0) {
  throw new Error('Failed to resolve the Electron executable for native-module verification');
}

// Only what `yarn electron:rebuild-native` rebuilds. The other transitive native modules
// (node-datachannel and friends) are rebuilt later by forge.config.js's rebuildConfig, so they are
// still node-ABI at this point and checking them here would fail for the wrong reason.
const nativeModules = ['better-sqlite3'];
const verificationScript = `
console.log('electron modules', process.versions.modules);
for (const moduleName of ${JSON.stringify(nativeModules)}) {
  try {
    require(moduleName);
    console.log('native-ok', moduleName);
  } catch (error) {
    console.error('native-fail', moduleName);
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  }
}
`;

const result = spawnSync(electronBinary, ['-e', verificationScript], {
  encoding: 'utf8',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
  },
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}

if (result.stderr) {
  process.stderr.write(result.stderr);
}

if (result.status !== 0) {
  throw new Error(`Electron native-module verification failed with exit code ${result.status ?? 'unknown'}`);
}
