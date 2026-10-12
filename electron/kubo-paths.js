import path from 'node:path';

export const getIpfsBinaryName = (platform = process.platform) => (platform === 'win32' ? 'ipfs.exe' : 'ipfs');

const getPlatformDirectory = (platform) => {
  if (platform === 'win32') return 'win';
  if (platform === 'darwin') return 'mac';
  return 'linux';
};

// bin/<platform>/ipfs under the repo root in dev, or under app.asar.unpacked in packaged builds
export const getBundledKuboPath = (rootPath, platform = process.platform) => path.join(rootPath, 'bin', getPlatformDirectory(platform), getIpfsBinaryName(platform));
