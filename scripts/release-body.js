// Prints the GitHub release body to stdout. Run by the finalize-release job in
// .github/workflows/release.yml once every build job has uploaded its artifacts:
//
//   node scripts/release-body > release-body.txt
//
// Assets come from the staged release-assets/ directory (override with RELEASE_ASSETS_DIR). When
// that directory is missing — a local dry run, or re-generating notes for a published release — it
// falls back to the asset list of the matching GitHub release.

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const conventionalChangelog = path.join(dirname, '..', 'node_modules', '.bin', 'conventional-changelog');
const version = JSON.parse(readFileSync(path.join(dirname, '..', 'package.json'), 'utf8')).version;

// sometimes release-count 1 is empty
let releaseChangelog =
  execSync(`${conventionalChangelog} --preset angular --release-count 1`).toString() ||
  execSync(`${conventionalChangelog} --preset angular --release-count 2`).toString();

// format
releaseChangelog = releaseChangelog.trim().replace(/\n\n+/g, '\n\n');

const assetsDir = path.resolve(dirname, '..', process.env.RELEASE_ASSETS_DIR || 'release-assets');
let files = [];
try {
  files = readdirSync(assetsDir);
} catch {
  files = await getPublishedAssetNames();
}

const linkTo = (file) => `https://github.com/bitsocialnet/bitbones/releases/download/v${version}/${encodeURIComponent(file)}`;
const has = (name, part) => name.toLowerCase().includes(part);
const isHtmlArchive = (name) => name.toLowerCase().endsWith('.zip') && has(name, '-html');

const appImage = files.find((f) => f.endsWith('.AppImage'));
const dmg = files.find((f) => f.endsWith('.dmg'));
const winSetup = files.find((f) => f.toLowerCase().endsWith('.exe') && has(f, 'setup'));
const winPortable = files.find((f) => f.toLowerCase().endsWith('.zip') && has(f, 'win32'));
const apk = files.find((f) => f.endsWith('.apk'));
const htmlZip = files.find(isHtmlArchive);

const section = (title, lines) => {
  const body = lines.filter(Boolean).join('\n');
  return body ? `### ${title}\n${body}` : '';
};

const downloads = [
  section('macOS', [dmg && `- [Download DMG](${linkTo(dmg)})`]),
  section('Windows', [
    winSetup && `- Installer: [Download EXE](${linkTo(winSetup)})`,
    winPortable && `- Portable: [Download ZIP](${linkTo(winPortable)})`,
    winSetup &&
      '- If Windows shows "Windows protected your PC" (SmartScreen), click "More info" then "Run anyway". To allow it permanently, right-click the .exe → Properties → check "Unblock".',
  ]),
  section('Linux', [appImage && `- AppImage: [Download](${linkTo(appImage)})`]),
  section('Android', [
    apk && `- APK: [Download](${linkTo(apk)})`,
    apk && has(apk, 'unsigned') && '- This APK is **unsigned** and will not install until it is signed with the release keystore.',
  ]),
  section('Static HTML build', [htmlZip && `- Static HTML archive: [Download](${linkTo(htmlZip)})`]),
]
  .filter(Boolean)
  .join('\n\n');

const releaseBody = `Progressive web app:
- https://bitbones.app

CLI client:
- https://github.com/bitsocialnet/bitsocial-cli/releases/latest
${downloads ? `\n## Downloads\n\n${downloads}\n` : ''}
## Changes

${releaseChangelog}`;

console.log(releaseBody);

async function getPublishedAssetNames() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const tag = process.env.GITHUB_REF_NAME || `v${version}`;
  if (!token || !repo) {
    return [];
  }
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'bitbones-release-notes',
        'X-GitHub-Api-Version': '2022-11-28',
        Accept: 'application/vnd.github+json',
      },
    });
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    return (data.assets || []).map((asset) => asset.name).filter(Boolean);
  } catch {
    return [];
  }
}
