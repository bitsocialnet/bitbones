---
name: refactor-pass
description: Perform a refactor pass focused on simplicity after recent changes. Use when the user asks for a refactor/cleanup pass, simplification, dead-code removal, or says "refactor pass".
---

# Refactor Pass

## Workflow

1. **Review recent changes** — identify simplification opportunities:
   - `git diff` for unstaged changes
   - `git diff --cached` for staged changes
   - `git log --oneline -5` for recent commits if no uncommitted changes

2. **Apply refactors** (in priority order):
   - Remove dead code and unreachable paths
   - Straighten convoluted logic flows
   - Remove excessive parameters or intermediary variables
   - Remove premature optimization (unnecessary `useMemo`, `useCallback`, etc.)
   - Extract duplicated logic into custom hooks (`src/hooks/`) or shared components (`src/components/`)

3. **Verify** — run all three checks (`src/` is strict TypeScript; there is no test suite):
   ```bash
   yarn lint && yarn type-check && yarn build
   ```
   Run `yarn knip` when the refactor removed imports or dependencies, and `yarn doctor` when it touched React UI logic.

4. **Optional suggestions** — identify abstractions or reusable patterns only if they clearly improve clarity. Keep suggestions brief; don't refactor speculatively.

## Project-Specific Patterns to Enforce

When refactoring, watch for these anti-patterns from AGENTS.md:

| Anti-pattern | Refactor to |
|---|---|
| `useState` for shared state | zustand store in `src/hooks/` (see `use-theme.ts`) |
| `useEffect` for data fetching | `@bitsocial/bitsocial-react-hooks` (`useComment`, `useFeed`, etc.) |
| `useEffect` to sync derived state | Calculate during render |
| Copy-pasted logic across components | Custom hook in `src/hooks/` |
| Boolean flag soup (`isLoading`, `isError`, `isSuccess`) | One state value in a zustand store |
| Prop drilling through many layers | zustand store |
| An address string passed to `useFeed`/`useCommunity`/`useCommunityStats`/`useCommunitiesStates` | `useCommunityIdentifier`/`useCommunityIdentifiers` from `src/hooks/use-community-identifier.ts` |

## Rules

- Before removing or simplifying code whose purpose is unclear, check `git log`/`git blame` for why it exists; if you still can't explain it, leave it alone and flag it instead (Chesterton's Fence)
- Don't change behavior — refactors must be semantically equivalent
- Don't introduce new dependencies. If one is genuinely needed, pin the exact version — no `^`, no `~`
- Format edited files with `npx oxfmt <file>` after changes
- If lint or the build fails after refactoring, fix it before finishing
