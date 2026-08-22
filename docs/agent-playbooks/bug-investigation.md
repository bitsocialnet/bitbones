# Bug Investigation Workflow

Use this when a bug is reported in a specific file/line/code block.

## Mandatory First Step

Before editing, check git history for the relevant code. Previous contributors may have introduced behavior for an edge case/workaround.

## Workflow

1. Scan recent commit titles (titles only) for the file/area:

```bash
# Recent commit titles for a specific file
git log --oneline -10 -- src/views/community/community.tsx

# Recent commit titles for a specific line range
git blame -L 20,35 src/views/community/community.tsx
```

2. Inspect only relevant commits with scoped diffs:

```bash
# Show commit message + diff for one file
git show <commit-hash> -- path/to/file.tsx
```

3. Continue with reproduction and fix after understanding the history context.

## Reproducing Protocol Bugs Here

bitbones exists to be the fastest place to reproduce a protocol bug, so reproduction usually means
opening the affected route rather than writing a harness:

```bash
yarn start          # https://bitbones.localhost, or PORTLESS=0 yarn start for http://localhost:5173
```

Before blaming the protocol, rule out the two argument traps documented in `known-surprises.md`:
an address string passed where a `CommunityIdentifier` is required (fails silently), and a
falsy-non-null hook argument (throws mid-render).

## Troubleshooting Rule

When blocked, search the web for recent fixes/workarounds.
