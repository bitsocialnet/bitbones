// Writes bitbones-release-manifest.json: the release tag plus the size and sha256 of every file in
// the web build. bitsocial-cli pins a bitbones release in its package.json and reads this manifest
// from the static HTML archive to check that what it downloaded is the release it pinned.
//
// forge.config.js's postMake hook calls generateReleaseManifest() while it builds the HTML archive.
// To run it by hand after `yarn build`:
//
//   node scripts/generate-release-manifest.mjs --build-dir build --out-dir out/make
//
// The release workflow then signs the manifest in a step of its own, so the key is not in the
// environment of the build:
//
//   node scripts/generate-release-manifest.mjs --sign out/make/bitbones-release-manifest.json
//
// That writes a detached ECDSA P-256 signature of the manifest bytes next to it as
// bitbones-release-manifest.sig.json, for consumers that fetch the build without a pinned archive
// hash. It needs RELEASE_MANIFEST_PRIVATE_KEY_PEM and fails when the key is missing or does not match
// the public key committed in release-manifest-public-key.json. The formats match the ones the
// sibling Bitsocial clients publish. `yarn release:manifest:keygen` makes a new keypair.

import { execFileSync } from 'node:child_process';
import { createHash, createPublicKey, sign, verify } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_SCHEMA = 'bitsocial.release-manifest.v1';

const SIGNATURE_SCHEMA = 'bitsocial.release-manifest-signature.v1';
const SIGNATURE_ALGORITHM = 'ECDSA-P256-SHA256';
const PUBLIC_KEY_FILE = path.join(REPO_ROOT, 'scripts', 'release-manifest-public-key.json');

export const RELEASE_MANIFEST_FILE = 'bitbones-release-manifest.json';
export const RELEASE_MANIFEST_SIGNATURE_FILE = 'bitbones-release-manifest.sig.json';

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

// Signs the manifest file as it is on disk and writes the signature next to it. publicKey is
// { keyId, publicKeyJwk }, by default the committed one.
export async function signReleaseManifest({ manifestPath, env = process.env, publicKey } = {}) {
  const privateKeyPem = env.RELEASE_MANIFEST_PRIVATE_KEY_PEM;
  if (!privateKeyPem) {
    throw new Error('RELEASE_MANIFEST_PRIVATE_KEY_PEM is required to sign the release manifest');
  }
  const signature = signManifest(await readFile(manifestPath), privateKeyPem, publicKey ?? JSON.parse(await readFile(PUBLIC_KEY_FILE, 'utf8')));
  const signaturePath = path.join(path.dirname(path.resolve(manifestPath)), RELEASE_MANIFEST_SIGNATURE_FILE);
  await writeFile(signaturePath, `${JSON.stringify(signature, null, 2)}\n`);
  return { signature, signaturePath };
}

// ieee-p1363 is the raw r||s form WebCrypto verifies, which is what a browser consumer uses
function signManifest(manifestBytes, privateKeyPem, { keyId, publicKeyJwk }) {
  const signatureBytes = sign('sha256', manifestBytes, { key: privateKeyPem, dsaEncoding: 'ieee-p1363' });
  const signature = {
    schema: SIGNATURE_SCHEMA,
    algorithm: SIGNATURE_ALGORITHM,
    keyId,
    manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
    signature: signatureBytes.toString('base64url'),
  };
  if (!verifyReleaseManifestSignature(manifestBytes, signature, { keyId, publicKeyJwk })) {
    throw new Error(`RELEASE_MANIFEST_PRIVATE_KEY_PEM does not match the committed public key ${keyId}`);
  }
  return signature;
}

export function verifyReleaseManifestSignature(manifestBytes, signature, { keyId, publicKeyJwk }) {
  return (
    signature?.schema === SIGNATURE_SCHEMA &&
    signature.algorithm === SIGNATURE_ALGORITHM &&
    signature.keyId === keyId &&
    signature.manifestSha256 === createHash('sha256').update(manifestBytes).digest('hex') &&
    verify(
      'sha256',
      manifestBytes,
      { key: createPublicKey({ key: publicKeyJwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' },
      Buffer.from(String(signature.signature), 'base64url'),
    )
  );
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
      // a manifest or signature left in the build dir by an earlier run must not be listed
      if (relativePath === RELEASE_MANIFEST_FILE || relativePath === RELEASE_MANIFEST_SIGNATURE_FILE) {
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
  if (args.has('--sign')) {
    const { signature, signaturePath } = await signReleaseManifest({ manifestPath: args.get('--sign') });
    console.log(`Wrote ${path.relative(process.cwd(), signaturePath)} (${signature.keyId})`);
  } else {
    const outDir = args.get('--out-dir');
    const { manifest, manifestPaths } = await generateReleaseManifest({ buildDir: args.get('--build-dir'), outDirs: outDir ? [outDir] : undefined });
    for (const manifestPath of manifestPaths) {
      console.log(`Wrote ${path.relative(process.cwd(), manifestPath)} (${manifest.releaseTag}, ${manifest.files.length} files)`);
    }
  }
}
