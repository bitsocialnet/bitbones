# Known Surprises

This file tracks repository-specific confusion points that caused agent mistakes.

## Entry Criteria

Add an entry only if all are true:

- It is specific to this repository (not generic advice).
- It is likely to recur for future agents.
- It has a concrete mitigation that can be followed.

If uncertain, ask the developer before adding an entry.

## Entry Template

```md
### [Short title]

- **Date:** YYYY-MM-DD
- **Observed by:** agent name or contributor
- **Context:** where/when it happened
- **What was surprising:** concrete unexpected behavior
- **Impact:** what went wrong or could go wrong
- **Mitigation:** exact step future agents should take
- **Status:** confirmed | superseded
```

## Entries

### Four protocol hooks take a CommunityIdentifier, and an address string fails silently

- **Date:** 2026-08-22
- **Observed by:** Tommaso + Claude
- **Context:** porting the client onto `@bitsocial/bitsocial-react-hooks`.
- **What was surprising:** `useFeed`, `useCommunity`, `useCommunityStats` and `useCommunitiesStates` take a `CommunityIdentifier` object (`{name}` or `{publicKey}`), not the `communityAddress` string the rest of the app passes around. Handing them an address does not throw and does not log — the hook just returns nothing.
- **Impact:** an empty feed, a blank community header, or missing stats that look like a network or protocol problem, and get debugged in the wrong layer for a long time.
- **Mitigation:** convert addresses through `src/hooks/use-community-identifier.js` (`useCommunityIdentifier` / `useCommunityIdentifiers`) before passing them to those four hooks. `useSubscribe` is the documented exception and still takes a plain `communityAddress` string.
- **Status:** confirmed

### A falsy-non-null hook argument throws mid-render

- **Date:** 2026-08-22
- **Observed by:** Tommaso + Claude
- **Context:** conditionally disabling a hook with the usual `cond && options` idiom.
- **What was surprising:** the hooks library asserts `arg == null || typeof arg === 'object'`. An earlier generation of the library asserted `!arg || ...`, so `false`, `''` and `0` used to be accepted. They now fail the assertion and throw during render, and this app has no error boundary, so the whole view goes blank.
- **Impact:** a one-character "optimization" turns into a white screen with a stack trace that points into `node_modules`, not into the component that caused it.
- **Mitigation:** pass `undefined`, never a falsy-non-null value: `useFeed(ready ? options : undefined)`. The same rule applies to every option object and every nested option (`options.comment`, `options.community`, ...).
- **Status:** confirmed

### `yarn build` and `yarn start` can rewrite tracked files

- **Date:** 2026-08-22
- **Observed by:** Tommaso + Claude
- **Context:** a stop-hook verification run left the working tree dirty without anyone editing a file.
- **What was surprising:** `build`, `dev` and `start` all run `yarn sync:lists` first, which fetches the default community lists from `bitsocialnet/lists` and rewrites the tracked `src/data/vendored-*.json` mirrors. The script is offline-safe (it keeps the existing files when a fetch fails), but on a good network it produces a real diff.
- **Impact:** a "clean" verification run appears to modify source files, and an agent may either commit an unrelated list refresh or revert a legitimate one.
- **Mitigation:** treat a `src/data/` diff after a build as content, not build output. Review it and keep or discard it deliberately; never hand edit those files — regenerate with `yarn sync:lists`. Untracked `build/` output, by contrast, should just be deleted before committing.
- **Status:** confirmed

### The release workflow is chained to another workflow, not to the tag

- **Date:** 2026-08-22
- **Observed by:** Tommaso + Claude
- **Context:** reading `.github/workflows/release.yml` while porting the `release` skill.
- **What was surprising:** `release.yml` does not trigger on `push: tags`. It triggers on `workflow_run` of a workflow named **CI Release**, and only when that run concluded successfully.
- **Impact:** pushing a `vX.Y.Z` tag publishes nothing if the upstream CI workflow is missing, renamed, or failed — the release simply never appears, with no error attached to the tag.
- **Mitigation:** before promising a release, confirm a workflow named `CI Release` exists in `.github/workflows/` and check its run for the pushed tag. If the release job never starts, look at the upstream workflow's conclusion, not at `release.yml`.
- **Status:** confirmed
