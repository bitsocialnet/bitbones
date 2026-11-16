import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, webcrypto } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  generateReleaseManifest,
  RELEASE_MANIFEST_FILE,
  RELEASE_MANIFEST_SIGNATURE_FILE,
  signReleaseManifest,
  verifyReleaseManifestSignature,
} from '../generate-release-manifest.mjs';

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

function keypair(keyId = 'test-key') {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return {
    env: { RELEASE_MANIFEST_PRIVATE_KEY_PEM: privateKey.export({ format: 'pem', type: 'sec1' }).toString() },
    publicKey: { keyId, publicKeyJwk: publicKey.export({ format: 'jwk' }) },
  };
}

test('signs the manifest bytes on disk, and a WebCrypto verifier accepts the signature', async () => {
  await withBuildDir(async ({ root, buildDir }) => {
    const { manifestPaths } = await generateReleaseManifest({ buildDir, outDirs: [path.join(root, 'out')], version: '1.2.3', env: {} });
    const { env, publicKey } = keypair();
    const { signature, signaturePath } = await signReleaseManifest({ manifestPath: manifestPaths[0], env, publicKey });

    assert.equal(signaturePath, path.join(root, 'out', RELEASE_MANIFEST_SIGNATURE_FILE));
    assert.deepEqual(JSON.parse(await readFile(signaturePath, 'utf8')), signature);
    const manifestBytes = await readFile(manifestPaths[0]);
    assert.equal(signature.schema, 'bitsocial.release-manifest-signature.v1');
    assert.equal(signature.algorithm, 'ECDSA-P256-SHA256');
    assert.equal(signature.keyId, 'test-key');
    assert.equal(signature.manifestSha256, createHash('sha256').update(manifestBytes).digest('hex'));
    assert.equal(verifyReleaseManifestSignature(manifestBytes, signature, publicKey), true);

    // the way a browser consumer checks it
    const key = await webcrypto.subtle.importKey('jwk', publicKey.publicKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    assert.equal(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(signature.signature, 'base64url'), manifestBytes), true);

    const tampered = Buffer.from(manifestBytes.toString().replace('1.2.3', '1.2.4'));
    assert.equal(verifyReleaseManifestSignature(tampered, signature, publicKey), false);
    assert.equal(verifyReleaseManifestSignature(tampered, { ...signature, manifestSha256: createHash('sha256').update(tampered).digest('hex') }, publicKey), false);
    assert.equal(verifyReleaseManifestSignature(manifestBytes, signature, { ...publicKey, keyId: 'other-key' }), false);
  });
});

test('signing fails without the key, and with a key that is not the pinned one', async () => {
  await withBuildDir(async ({ root, buildDir }) => {
    const { manifestPaths } = await generateReleaseManifest({ buildDir, outDirs: [path.join(root, 'out')], version: '1.2.3', env: {} });
    const [manifestPath] = manifestPaths;

    await assert.rejects(signReleaseManifest({ manifestPath, env: {}, publicKey: keypair().publicKey }), /RELEASE_MANIFEST_PRIVATE_KEY_PEM is required/);
    await assert.rejects(signReleaseManifest({ manifestPath, env: keypair().env, publicKey: keypair().publicKey }), /does not match the committed public key/);
    // with no publicKey given, the committed one is the pin
    await assert.rejects(signReleaseManifest({ manifestPath, env: keypair().env }), /does not match the committed public key bitbones-release-p256-/);
  });
});

test('a signature already in the build dir is not listed in the next manifest', async () => {
  await withBuildDir(async ({ buildDir }) => {
    const { manifestPaths } = await generateReleaseManifest({ buildDir, version: '1.2.3', env: {} });
    const { env, publicKey } = keypair();
    await signReleaseManifest({ manifestPath: manifestPaths[0], env, publicKey });
    const { manifest } = await generateReleaseManifest({ buildDir, version: '1.2.3', env: {} });

    assert.deepEqual(
      manifest.files.map((file) => file.path),
      ['assets/app.js', 'index.html'],
    );
  });
});
