import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { verifyReleaseManifestSignature } from './generate-release-manifest.mjs';

if (process.env.VERCEL_ENV !== 'production') {
  execFileSync('corepack', ['yarn', 'build'], { stdio: 'inherit' });
} else {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'bitbones-release-'));
  try {
    const base = 'https://github.com/bitsocialnet/bitbones/releases/latest/download/';
    const download = async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`Release download failed: ${response.status} ${url}`);
      return Buffer.from(await response.arrayBuffer());
    };
    const manifestBytes = await download(base + 'bitbones-release-manifest.json');
    const manifest = JSON.parse(manifestBytes);
    if (
      manifest.schema !== 'bitsocial.release-manifest.v1' ||
      manifest.appName !== 'bitbones' ||
      manifest.verificationScope !== 'web-release-all-files' ||
      !/^v\d+\.\d+\.\d+$/.test(manifest.releaseTag) ||
      manifest.releaseTag !== `v${manifest.version}` ||
      !manifest.files?.length
    ) {
      throw new Error('Invalid bitbones release manifest');
    }
    // Resolve latest once, then pin all remaining downloads to that signed release.
    const releaseBase = `https://github.com/bitsocialnet/bitbones/releases/download/${manifest.releaseTag}/`;
    const signature = JSON.parse(await download(releaseBase + 'bitbones-release-manifest.sig.json'));
    const publicKey = JSON.parse(await readFile(new URL('./release-manifest-public-key.json', import.meta.url)));
    if (!verifyReleaseManifestSignature(manifestBytes, signature, publicKey)) {
      throw new Error('Invalid release manifest signature');
    }
    const archive = path.join(temporaryDirectory, 'release.zip');
    await writeFile(archive, await download(releaseBase + `bitbones-html-${manifest.version}.zip`));
    const prefix = `bitbones-html-${manifest.version}/`;
    const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split('\n');
    if (entries.some((entry) => !entry.startsWith(prefix) || entry.split('/').includes('..') || entry.includes('\\'))) {
      throw new Error('Unsafe release archive path');
    }
    execFileSync('unzip', ['-q', archive, '-d', temporaryDirectory]);
    const releaseDirectory = path.join(temporaryDirectory, prefix);
    for (const file of manifest.files) {
      if (!file.path || path.isAbsolute(file.path) || file.path.split('/').includes('..') || file.path.includes('\\')) {
        throw new Error('Unsafe manifest path');
      }
      const filePath = path.join(releaseDirectory, file.path);
      if (!(await lstat(filePath)).isFile()) throw new Error(`Invalid release file: ${file.path}`);
      const bytes = await readFile(filePath);
      if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
        throw new Error(`Release file mismatch: ${file.path}`);
      }
    }
    await rm('build', { recursive: true, force: true });
    await cp(releaseDirectory, 'build', { recursive: true });
    console.log(`Verified ${manifest.files.length} files from signed bitbones ${manifest.releaseTag}`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
