// Writes bitbones-release-manifest.json: the release tag plus the size and sha256 of every file in
// the web build. bitsocial-cli pins a bitbones release in its package.json and reads this manifest
// from the static HTML archive to check that what it downloaded is the release it pinned.
//
// forge.config.js's postMake hook calls generateReleaseManifest() while it builds the HTML archive.
// To run it by hand after `yarn build`:
//
//   node scripts/generate-release-manifest.mjs --build-dir build --out-dir out/make
//
// The manifest is unsigned. The format matches the one the sibling Bitsocial clients publish, which
// also ship a detached signature file next to it.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_SCHEMA = 'bitsocial.release-manifest.v1';

export const RELEASE_MANIFEST_FILE = 'bitbones-release-manifest.json';

export async function generateReleaseManifest({ buildDir, outDirs, version, env = process.env } = {}) {
  const resolvedBuildDir = path.resolve(buildDir ?? path.join(REPO_ROOT, 'build'));
  const packageVersion = version ?? JSON.parse(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8')).version;

  const manifest = {
    schema: MANIFEST_SCHEMA,
    appName: 'bitbones',
    version: packageVersion,
    // release.yml's preflight job fails the release when the tag and package.json disagree
    releaseTag: env.GITHUB_REF_NAME?.startsWith('v') ? env.GITHUB_REF_NAME : `v${packageVersion}`,
    verificationScope: 'web-release-all-files',
    generatedAt: new Date().toISOString(),
    sourceCommit: env.GITHUB_SHA || readGitCommit(),
    files: await listFiles(resolvedBuildDir),
  };
  if (manifest.files.length === 0) {
    throw new Error(`No files found in ${resolvedBuildDir}; run \`yarn build\` first`);
  }

  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const manifestPaths = [];
  for (const outDir of outDirs ?? [resolvedBuildDir]) {
    await mkdir(outDir, { recursive: true });
    const manifestPath = path.join(path.resolve(outDir), RELEASE_MANIFEST_FILE);
    await writeFile(manifestPath, manifestBytes);
    manifestPaths.push(manifestPath);
  }
  return { manifest, manifestPaths };
}

async function listFiles(rootDir) {
  const entries = [];

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const relativePath = path.relative(rootDir, absolutePath).split(path.sep).join('/');
      // a manifest left in the build dir by an earlier run must not describe itself
      if (relativePath === RELEASE_MANIFEST_FILE) {
        continue;
      }
      const bytes = await readFile(absolutePath);
      entries.push({ path: relativePath, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }

  await walk(rootDir);
  // plain code-unit order, so the list does not depend on the build machine's locale
  return entries.sort((first, second) => (first.path < second.path ? -1 : first.path > second.path ? 1 : 0));
}

function readGitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value) {
      throw new Error(`Invalid argument near ${key ?? '<empty>'}`);
    }
    args.set(key, value);
  }
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = parseArgs(process.argv.slice(2));
  const outDir = args.get('--out-dir');
  const { manifest, manifestPaths } = await generateReleaseManifest({ buildDir: args.get('--build-dir'), outDirs: outDir ? [outDir] : undefined });
  for (const manifestPath of manifestPaths) {
    console.log(`Wrote ${path.relative(process.cwd(), manifestPath)} (${manifest.releaseTag}, ${manifest.files.length} files)`);
  }
}
