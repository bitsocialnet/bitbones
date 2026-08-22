---
name: release
description: Automate a full bitbones release — analyze commits, update the release body one-liner, bump the version, regenerate the changelog, commit, tag, and push. Use when the user says "release", "new version", "cut a release", "prepare release", or provides a version number to ship.
---

# Release

End-to-end release automation for bitbones. Releases are manual and tag-triggered: nothing publishes
until a `vX.Y.Z` tag reaches `origin`.

## Usage

The user provides a version bump (`patch`, `minor`, `major`, or explicit `x.y.z`).
If omitted, ask which bump level they want.

## Workflow

Copy this checklist and track progress:

```text
Release Progress:
- [ ] Step 1: Analyze commits
- [ ] Step 2: Write the release body one-liner
- [ ] Step 3: Bump version in package.json
- [ ] Step 4: Generate changelog
- [ ] Step 5: Verify
- [ ] Step 6: Commit, tag, push
```

### Step 1 — Analyze commits

```bash
git tag --sort=-creatordate | head -1
```

Then list commits since that tag:

```bash
git log --oneline <tag>..HEAD
```

If there are no new commits, stop — nothing to release.

Categorize by Conventional Commits prefix (`feat:`, `fix:`, `perf:`, `refactor:`, `chore:`, etc.).
The generated changelog uses the angular preset, so `feat`, `fix`, `perf` and `revert` are the
prefixes that show up there.

### Step 2 — Write the release body one-liner

`scripts/release-body.js` prints the GitHub release body. The release workflow runs
`node scripts/release-body > release-body.txt` and uploads that as the release description.

Put a one-line summary at the top of that body, in a `oneLinerDescription` constant interpolated
into the `releaseBody` template. If the constant is not there yet, add it — do not restructure the
rest of the template (the app-mirror and CLI links must stay).

Rules for the sentence:

- Start with "This version..." or "This release..."
- One sentence, no bullets
- Lead with the biggest features/fixes, group minor ones
- Plain language — this is read by users, not developers. No internal library names, no dev
  shorthand (`perf`, `deps`, `refactor`, `a11y`, `lint`), no file paths, no PR numbers
- End with a period

Good examples:

- "This version adds a community settings editor and fixes the empty feed after switching lists."
- "This release adds inbox notifications and makes the first paint work offline."

Full rules live in the `release-description` skill.

### Step 3 — Bump version

Read `package.json`, compute the new version from the bump level, and update the `"version"` field.

| Bump | Effect |
|------|--------|
| `patch` | `0.1.3` → `0.1.4` |
| `minor` | `0.1.3` → `0.2.0` |
| `major` | `0.1.3` → `1.0.0` |
| `x.y.z` | Set exactly |

### Step 4 — Generate changelog

```bash
yarn changelog
```

This regenerates `CHANGELOG.md` from conventional commits, creating the file if it is missing.

### Step 5 — Verify

```bash
yarn lint
yarn type-check
yarn build
yarn knip
```

Run `yarn doctor` too when the release contains React UI changes; `yarn retest:quality` runs
build, lint, type-check, knip and doctor in one go.

There is no test suite in this repo yet; `yarn type-check` (`tsc --noEmit`) is the type gate.
`yarn build` runs `yarn sync:lists` first, which may rewrite the tracked
`src/data/vendored-*.json` mirrors. Review that diff and include it in the release commit if the
upstream lists genuinely changed; do not revert it silently.

Also delete the untracked `build/` output before committing.

### Step 6 — Commit, tag, push

```bash
git add -A
git commit -m "chore(release): v<version>"
git push
git tag v<version>
git push --tags
```

The pushed tag is what starts the release. `.github/workflows/release.yml` builds the Linux
AppImage, macOS dmg, Windows exe/zip, and the signed Android APK, then attaches them to the GitHub
release with the body from Step 2. Do not push the tag until the user has approved the version.

## Dry-run mode

If the user says "dry run" or "preview", execute Steps 1–5 but **skip Step 6** (git operations).
Print a summary of what would be committed so the user can review.
