import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

async function render({ version = '0.1.0', changelog, assets = [] }) {
  const root = await mkdtemp(path.join(tmpdir(), 'bitbones-release-body-'));
  try {
    await mkdir(path.join(root, 'scripts'));
    const assetsDir = path.join(root, 'release-assets');
    await mkdir(assetsDir);
    await copyFile(new URL('../release-body.js', import.meta.url), path.join(root, 'scripts/release-body.js'));
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module', version }));
    await writeFile(path.join(root, 'CHANGELOG.md'), changelog);
    for (const name of assets) await writeFile(path.join(assetsDir, name), '');
    return spawnSync(process.execPath, ['scripts/release-body.js'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, RELEASE_ASSETS_DIR: assetsDir, GITHUB_TOKEN: '', GITHUB_REPOSITORY: '' },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('publishes the reviewed version only, preserving its notes and staged download links', async () => {
  for (const heading of ['# 0.1.0 (2026-11-16)', '## [0.1.0](https://example.test/compare) (2026-11-16)']) {
    const result = await render({
      changelog: `# Changelog\n\n## 0.2.0\nfuture changes\n\n${heading}\n\n## Highlights\n\nReviewed summary.\n\n### Features\n\n* Reviewed wording.\n\n# 0.0.9\nold changes\n`,
      assets: ['bitbones-0.1.0-unsigned.apk', 'bitbones-html-0.1.0.zip', 'bitbones-0.1.0-arm64.dmg'],
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^This release introduces bitbones/);
    assert.match(result.stdout, /## Highlights\n\nReviewed summary\./);
    assert.match(result.stdout, /### Features\n\n\* Reviewed wording\./);
    assert.doesNotMatch(result.stdout, /future changes|old changes/);
    assert.match(result.stdout, /releases\/download\/v0\.1\.0\/bitbones-html-0\.1\.0\.zip/);
    assert.match(result.stdout, /releases\/download\/v0\.1\.0\/bitbones-0\.1\.0-arm64\.dmg/);
    assert.match(result.stdout, /This APK is \*\*unsigned\*\*/);
  }
});

test('does not describe a later release as the introduction of bitbones', async () => {
  const result = await render({ version: '0.1.1', changelog: '# 0.1.1\n\n### Bug Fixes\n\n* A later correction.\n' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /A later correction/);
  assert.doesNotMatch(result.stdout, /introduces bitbones/);
});

test('rejects missing version notes instead of publishing another release section', async () => {
  const result = await render({ changelog: '# 0.0.9\n\nOld notes.\n' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CHANGELOG\.md has no section for 0\.1\.0/);
  assert.equal(result.stdout, '');
});
