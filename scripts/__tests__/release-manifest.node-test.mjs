import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { generateReleaseManifest, RELEASE_MANIFEST_FILE } from '../generate-release-manifest.mjs';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

async function withBuildDir(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'bitbones-release-manifest-'));
  const buildDir = path.join(root, 'build');
  await mkdir(path.join(buildDir, 'assets'), { recursive: true });
  await writeFile(path.join(buildDir, 'index.html'), '<!DOCTYPE html>');
  await writeFile(path.join(buildDir, 'assets', 'app.js'), 'console.log(1)');
  try {
    await run({ root, buildDir });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('lists every build file with its size and sha256, sorted by path', async () => {
  await withBuildDir(async ({ root, buildDir }) => {
    const { manifest } = await generateReleaseManifest({ buildDir, outDirs: [path.join(root, 'out')], version: '1.2.3', env: {} });

    assert.deepEqual(manifest.files, [
      { path: 'assets/app.js', bytes: 14, sha256: sha256('console.log(1)') },
      { path: 'index.html', bytes: 15, sha256: sha256('<!DOCTYPE html>') },
    ]);
    assert.equal(manifest.schema, 'bitsocial.release-manifest.v1');
    assert.equal(manifest.appName, 'bitbones');
    assert.equal(manifest.version, '1.2.3');
    assert.equal(manifest.verificationScope, 'web-release-all-files');
  });
});

test('releaseTag is the pushed tag in CI and v<version> elsewhere', async () => {
  await withBuildDir(async ({ root, buildDir }) => {
    const outDirs = [path.join(root, 'out')];
    const fromTag = await generateReleaseManifest({ buildDir, outDirs, version: '1.2.3', env: { GITHUB_REF_NAME: 'v1.2.3', GITHUB_SHA: 'abc123' } });
    assert.equal(fromTag.manifest.releaseTag, 'v1.2.3');
    assert.equal(fromTag.manifest.sourceCommit, 'abc123');

    const fromBranch = await generateReleaseManifest({ buildDir, outDirs, version: '1.2.3', env: { GITHUB_REF_NAME: 'master' } });
    assert.equal(fromBranch.manifest.releaseTag, 'v1.2.3');

    const local = await generateReleaseManifest({ buildDir, outDirs, version: '1.2.3', env: {} });
    assert.equal(local.manifest.releaseTag, 'v1.2.3');
  });
});

test('writes the same manifest to every output directory', async () => {
  await withBuildDir(async ({ root, buildDir }) => {
    const outDirs = [path.join(root, 'archive'), path.join(root, 'assets')];
    const { manifest, manifestPaths } = await generateReleaseManifest({ buildDir, outDirs, version: '1.2.3', env: {} });

    assert.deepEqual(
      manifestPaths,
      outDirs.map((outDir) => path.join(outDir, RELEASE_MANIFEST_FILE)),
    );
    const [first, second] = await Promise.all(manifestPaths.map((manifestPath) => readFile(manifestPath, 'utf8')));
    assert.equal(first, second);
    assert.deepEqual(JSON.parse(first), JSON.parse(JSON.stringify(manifest)));
  });
});

test('a manifest already in the build dir is not listed in the next one', async () => {
  await withBuildDir(async ({ buildDir }) => {
    await generateReleaseManifest({ buildDir, version: '1.2.3', env: {} });
    const { manifest } = await generateReleaseManifest({ buildDir, version: '1.2.3', env: {} });

    assert.deepEqual(
      manifest.files.map((file) => file.path),
      ['assets/app.js', 'index.html'],
    );
  });
});

test('fails on an empty build dir', async () => {
  await withBuildDir(async ({ root }) => {
    const emptyDir = path.join(root, 'empty');
    await mkdir(emptyDir);
    await assert.rejects(generateReleaseManifest({ buildDir: emptyDir, version: '1.2.3', env: {} }), /No files found/);
  });
});
