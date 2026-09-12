---
name: release-description
description: Draft or update bitbones release wording from verified changes.
---

<!-- Generated from .agents/skills/release-description/SKILL.md; run yarn ai-workflow:sync. -->

# Release description

Inspect the applicable release tag and subsequent commits, reading source where a title is ambiguous. Lead with the most meaningful user-facing changes in one concise sentence beginning “This version” or “This release” and ending with a period. Avoid internal library names, file paths, commit prefixes, PR numbers, and unsupported claims.

A wording request returns a draft. For an authorized file update, inspect `scripts/release-body.js`; add or update a one-liner in its existing output without replacing generated changelog, download, or app/CLI links. Verify syntax and rendered output when its dependencies are available. The script can query release assets when GitHub environment variables are set; do not require network access merely to check wording.
