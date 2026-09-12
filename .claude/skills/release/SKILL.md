---
name: release
description: Preview, prepare, or perform an authorized bitbones release.
---

<!-- Generated from .agents/skills/release/SKILL.md; run yarn ai-workflow:sync. -->

# Release

A preview reads the applicable release tag/history and returns proposed version/notes without changing files. Preparation updates authorized local release files. Publication requires authorization for the specific commit, tag, and push; reuse authorization already supplied.

Inspect `package.json`, `scripts/release-body.js`, and `.github/workflows/release.yml`. Releases start when a `vX.Y.Z` tag reaches origin. The workflow builds desktop artifacts and a signed Android APK. Use the explicit version/bump or infer it from the requested scope; ask only if a necessary version choice is unresolved.

For preparation, summarize user-visible changes with `release-description`, update the version, run `corepack yarn install` and `yarn changelog`, then verify lint, type-check and build sequentially. Use relevant dependency or React diagnostics when warranted. There is no application test runner. `yarn build` refreshes tracked `src/data/vendored-*.json`; inspect that diff deliberately and preserve unrelated files/build artifacts.

Stage only release-owned files, keep Git hooks enabled, and verify the target commit before tagging. Push the explicit branch/tag only within authorized publication scope; never push every local tag. Do not repeat checks for an unchanged final state.
