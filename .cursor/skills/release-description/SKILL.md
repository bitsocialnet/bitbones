---
name: release-description
description: Update the one-liner release description in scripts/release-body.js by analyzing commit titles since the last git tag. Use when the user asks to update the release description, release notes one-liner, or prepare release body for a new version.
---

# Release Description

`scripts/release-body.js` prints the body of the GitHub release. Update its one-line summary before
each release.

## Steps

### 1. Find the latest release tag

```bash
git tag --sort=-creatordate | head -1
```

### 2. List commit titles since that tag

```bash
git log --oneline <tag>..HEAD
```

If there are no commits since the tag, stop — nothing to update.

### 3. Analyze the commits

Categorize by Conventional Commits prefix:

| Prefix | Category |
|--------|----------|
| `feat:` | New features |
| `fix:` | Bug fixes |
| `perf:` | Performance improvements |
| `refactor:` | Refactors / internal changes |
| `chore:`, `docs:`, `ci:` | Maintenance (mention only if significant) |
| No prefix | Read the title to infer category |

### 4. Write the one-liner

Compose a single sentence that summarizes the release at a high level. Rules:

- **Start with** "This version..." or "This release..."
- **Be concise** — one sentence, no bullet points
- **Highlight the most impactful changes** — lead with the biggest features or fixes
- **Group similar changes** — e.g. "several bug fixes" instead of listing each one
- **Use plain language** — this is read by users, not developers. No internal library or module
  names, no dev shorthand (`perf`, `deps`, `refactor`, `a11y`, `lint`, `CI`), no file paths, no
  component names, no PR numbers
- **Don't mention every commit** — summarize the theme

Good one-liners:

- "This version adds a community settings editor, an inbox for replies, and several bug fixes."
- "This version makes the first feed render instantly offline and fixes the blank community header."
- "This release adds desktop and Android builds alongside the web app."

Bad one-liners (and why):

- "Bumps hooks lib and fixes selector churn." — names internals; a user cannot tell what changed.
- "Perf + deps + a11y pass." — dev shorthand, no user-visible outcome.
- "Fixes issue #42." — a PR/issue number means nothing in a release body.

### 5. Update the constant

Edit `scripts/release-body.js`. The body is built from a template literal; keep the app-mirror and
CLI links intact and interpolate the summary at the top:

```js
// One-liner summary of what changed in this release. Update before each release.
const oneLinerDescription = 'Your new one-liner here.';

const releaseBody = `${oneLinerDescription}

Progressive web app mirrors:
...`;
```

If `oneLinerDescription` does not exist in the file yet, add it exactly like this rather than
rewriting the rest of the template.

### 6. Verify

Read the updated line back to confirm it looks right. The string should:

- Be a single sentence
- End with a period
- Not contain backticks or markdown

Then confirm the whole body still renders:

```bash
node scripts/release-body.js
```
