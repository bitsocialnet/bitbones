// download the kubo binary into bin/<platform>/ before packaging, or on first dev launch

import fs from 'fs-extra';
import ProgressBar from 'progress';
import https from 'https';
import extractZip from 'extract-zip';
import * as tar from 'tar';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBundledKuboPath } from './kubo-paths.js';
const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// Kubo's GitHub releases, not dist.ipfs.tech, which times out from CI runners
const kuboReleaseBaseUrl = 'https://github.com/ipfs/kubo/releases/download';

const ipfsClientVersion = '0.39.0';

const toKuboArch = (arch) => (arch === 'arm64' ? 'arm64' : 'amd64');

const getKuboUrl = (platform, arch) => {
  const kuboArch = toKuboArch(arch);
  const fileName =
    platform === 'win32'
      ? `kubo_v${ipfsClientVersion}_windows-${kuboArch}.zip`
      : `kubo_v${ipfsClientVersion}_${platform === 'darwin' ? 'darwin' : 'linux'}-${kuboArch}.tar.gz`;
  return `${kuboReleaseBaseUrl}/v${ipfsClientVersion}/${fileName}`;
};

const downloadWithProgress = (url) =>
  new Promise((resolve, reject) => {
    const split = url.split('/');
    const fileName = split[split.length - 1];
    const chunks = [];
    const req = https.request(url);
    req.on('error', (err) => {
      console.error(`Error making request for ${url}:`, err);
      reject(err);
    });
    req.on('response', (res) => {
      res.on('error', (err) => {
        console.error(`Error in response for ${url}:`, err);
        reject(err);
      });
      // GitHub release downloads redirect to their storage host
      if (res.statusCode === 301 || res.statusCode === 302) {
        // drain the redirect body so its socket is released
        res.resume();
        resolve(downloadWithProgress(res.headers.location));
        return;
      }

      if (!res.statusCode || res.statusCode >= 400) {
        res.resume();
        reject(new Error(`Download request for ${url} failed with status ${res.statusCode ?? 'unknown'}`));
        return;
      }

      const len = parseInt(res.headers['content-length'], 10);
      console.log();
      const bar = new ProgressBar(`  ${fileName} [:bar] :rate/bps :percent :etas`, {
        complete: '=',
        incomplete: ' ',
        width: 20,
        total: len,
        stream: process.stdout,
      });
      res.on('data', (chunk) => {
        chunks.push(chunk);
        bar.tick(chunk.length);
      });
      res.on('end', () => {
        console.log('\n');
        resolve(Buffer.concat(chunks));
      });
    });
    req.end();
  });

// retry transient network errors
const downloadWithRetry = async (url, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await downloadWithProgress(url);
    } catch (err) {
      console.warn(`Download attempt ${attempt} for ${url} failed:`, err);
      if (attempt === retries) throw err;
      await new Promise((res) => setTimeout(res, attempt * 1000));
    }
  }
};

const extractArchive = async (archivePath, destinationPath) => {
  if (archivePath.endsWith('.zip')) {
    await extractZip(archivePath, { dir: destinationPath });
    return;
  }
  if (archivePath.endsWith('.tar.gz')) {
    await tar.x({ file: archivePath, cwd: destinationPath });
    return;
  }
  throw new Error(`Unsupported archive format: ${archivePath}`);
};

// Downloads into bin/<platform>/ipfs. platform and arch default to the host, and forge's
// generateAssets hook passes its target so --platform/--arch packages get the matching binary.
export const downloadIpfsClients = async ({ platform = process.platform, arch = process.arch } = {}) => {
  const url = getKuboUrl(platform, arch);
  const binPath = getBundledKuboPath(projectRoot, platform);
  const destinationPath = path.dirname(binPath);
  // re-download when the pinned version or target changes
  const sourceMarkerPath = path.join(destinationPath, '.kubo-source');
  const cachedSource = fs.pathExistsSync(sourceMarkerPath) ? fs.readFileSync(sourceMarkerPath, 'utf8').trim() : undefined;
  if (fs.pathExistsSync(binPath) && cachedSource === url) {
    return;
  }

  console.log(`Downloading kubo from ${url} to ${destinationPath}`);
  const archivePath = path.join(destinationPath, url.split('/').pop());
  const extractedPath = path.join(destinationPath, 'kubo');
  const file = await downloadWithRetry(url);
  fs.ensureDirSync(destinationPath);
  await fs.writeFile(archivePath, file);
  fs.removeSync(extractedPath);
  await extractArchive(archivePath, destinationPath);
  fs.moveSync(path.join(extractedPath, path.basename(binPath)), binPath, { overwrite: true });
  fs.writeFileSync(sourceMarkerPath, `${url}\n`);
  // only the binary is packaged, so remove the archive and the rest of the release folder
  fs.removeSync(archivePath);
  fs.removeSync(extractedPath);
  console.log(`kubo ${ipfsClientVersion} ready at ${binPath}`);
};
