# AGENTS.md

## Purpose

This file defines the always-on rules for AI agents working on bitbones.
Use this as the default policy. Load linked playbooks only when their trigger condition applies.

## Surprise Handling

The role of this file is to reduce recurring agent mistakes and confusion points in this repository.
If you encounter something surprising or ambiguous while working, alert the developer immediately.
After confirmation, add a concise entry to `docs/agent-playbooks/known-surprises.md` so future agents avoid the same issue.
Only record items that are repo-specific, likely to recur, and have a concrete mitigation.

## Project Overview

bitbones is a bare bones GUI client for the Bitsocial protocol. Deliberately minimal: no styling
opinions, no product features, every view a thin wrapper over one hook. It exists to make the
protocol legible and to be the fastest place to reproduce a bug against real communities.

That minimalism is the product. Before adding a component, a store, or an abstraction, ask whether
the protocol behavior is still visible through it.

## Instruction Priority

- **MUST** rules are mandatory.
- **SHOULD** rules are strong defaults unless task context requires a different choice.
- If guidance conflicts, prefer: user request > MUST > SHOULD > playbooks.

## Agent Operating Principles

- Before editing, state important assumptions when the task is ambiguous. Ask instead of silently choosing between materially different interpretations.
- After understanding the affected flow, apply the [Ponytail](https://github.com/DietrichGebert/ponytail) solution ladder: skip work that is not required; reuse repository code; prefer the standard library, native platform features, then installed dependencies; only then write the minimum new code. Never trade away explicit requirements, correctness, clarity, validation, error handling, security, or accessibility.
- Keep diffs surgical. Do not refactor, reformat, rename, or "improve" adjacent code unless it is necessary for the task.
- Clean up only artifacts created by the current change, such as newly unused imports or dead helper code.
- For non-trivial work, define success criteria and verify them with the narrowest reliable checks before marking the task complete.

## LLM Knowledge Base Policy

Use compiled context for orientation, not as source of truth.

Source of truth:

- Code, package manifests, docs, and runtime/live evidence when relevant.

Compiled context:

- `AGENTS.md`, `CLAUDE.md`, and repo-managed `.codex/`, `.cursor/`, and `.claude/` workflow files.
- `docs/agent-playbooks/**`, `docs/agent-runs/**`, and tracked `llms.txt` / `llms-full.txt` files when present.

Agents may use compiled context to navigate quickly, but must verify against source files before making behavioral claims or edits. External code graph, RAG, MCP, or wiki tools are optional local accelerators unless the developer explicitly asks to make one part of the committed workflow.

## Task Router (Read First)

| Situation | Required action |
|---|---|
| A protocol hook is called (`useFeed`, `useCommunity`, `useCommunityStats`, `useCommunitiesStates`, `useSubscribe`) | Check both argument traps in the Protocol Hook Rules below before finishing |
| React UI logic changed (`src/components`, `src/views`, `src/hooks`, `src/lib`, `src/app.tsx`) | Follow the React architecture rules below, review the diff with `vercel-react-best-practices` when available, fix valid findings, then run `yarn doctor` |
| Anything under `src/` changed (types, props, hook signatures, a new file) | Run `yarn type-check`; `src/` is strict TypeScript and `tsc --noEmit` is the only type gate |
| `package.json` changed | Run `corepack yarn install` to keep `yarn.lock` in sync |
| Dependencies or import graph changed | Run `yarn knip` (`yarn knip:full` for the advisory full report) |
| Translation key/value changed | Use the `translate` skill (spawns parallel `translator` subagents); it drives `scripts/update-translations.js`, never hand-edit the language files |
| Public-facing English content or AI context changed (`README.md`, `index.html`, `AGENTS.md`, docs pages) | Run `yarn llms:generate`; inspect and commit any resulting changes to `public/llms*.txt` |
| Bug report in a specific file/line | Start with the git history scan in `docs/agent-playbooks/bug-investigation.md` before editing |
| UI/visual behavior changed | Open the affected route with `yarn start` and check it by hand, desktop plus a mobile viewport. There is no test suite and no committed browser-automation wrapper in this repo |
| Cutting a version | Use the `release` skill. Releases are manual and tag-triggered; nothing publishes until a `vX.Y.Z` tag reaches `origin` |
| Long-running task spans multiple sessions, handoffs, or spawned agents | Use `docs/agent-playbooks/long-running-agent-workflow.md` and keep a machine-readable feature list plus a progress log |
| New reviewable feature/fix started while on `master` | Create a short-lived `feature/*`, `fix/*`, `docs/*`, or `chore/*` branch from `master` before editing; use a separate worktree only for parallel tasks |
| Open PR needs feedback triage or merge readiness check | Use the `review-and-merge-pr` skill |
| Before finishing or committing code, docs, or AI workflow changes, and before pushing/opening a PR | Run the advisory `code-quality-review` skill on the current diff; treat findings as suggestions, not blockers |
| Repo AI workflow files changed (`.codex/**`, `.cursor/**`, `.claude/**`) | Keep the three copies aligned; run `yarn ai-workflow:check`; update `AGENTS.md` if the default agent policy changes |
| GitHub operation needed | Use `gh` CLI, not GitHub MCP |
| User asks for commit/issue phrasing | Use `docs/agent-playbooks/commit-issue-format.md` |
| Surprising/ambiguous repo behavior encountered | Alert developer and, once confirmed, document in `docs/agent-playbooks/known-surprises.md` |

## Stack

- Node 22.12.0 (`nvm use`), Yarn 4.17.1 via corepack (`corepack enable`)
- React 19 + Vite 8 (rolldown) + TypeScript 7 in strict mode, CSS modules
- `@bitsocial/bitsocial-react-hooks` for all protocol access, `@pkcprotocol/pkc-js` in electron only
- zustand 4 for local UI state, react-router-dom 7 with `HashRouter`
- i18next for translations
- oxlint + oxfmt, knip for dependency hygiene, react-doctor for React review
- electron-forge for desktop, capacitor for android

`src/` is **strict TypeScript**: every source file is `.ts` or `.tsx`, `tsconfig.json` sets
`strict: true` and `allowJs: false`, and `yarn type-check` (`tsc --noEmit`) is the type gate.
`electron/`, `scripts/`, `vite.config.js`, and `forge.config.js` stay plain JavaScript on purpose —
only `src/` is TypeScript. There is still no test runner: no vitest, no `yarn test`. Do not invent one.

## Project Structure

```text
src/
├── components/   # Reusable UI components (colocated .module.css)
├── views/        # Page-level route views, one per hook
├── hooks/        # Custom hooks, including the small zustand stores
├── lib/          # Utilities/helpers
└── data/         # Generated default-community-list mirrors
```

Ambient declarations live in three files at the root of `src/`: `modules.d.ts` (CSS modules),
`env.d.ts` (`import.meta.env`), and `globals.d.ts` (`Window` extras).

There is no `src/stores/` directory. Shared UI state lives in small zustand stores created with
`createStore` inside `src/hooks/` (see `src/hooks/use-theme.ts`) or colocated with the single
component that owns them.

## Core MUST Rules

### Naming and Branding Rules

- Never reintroduce the protocol's former name, or the name of the client bitbones was ported from,
  anywhere in this repo — not in code, comments, docs, commit messages, or translations. The protocol
  is **Bitsocial**, the low-level library is **PKC** (`pkc-js`, `pkcOptions`, `.pkc` data dir), and
  communities are **communities**, never the old term for them.
- `peers.pleb.bot` and `peers.plebpubsub.xyz` are third-party routing endpoints owned by someone
  else. They stay verbatim wherever they already appear, and are the only exception.
- The client is `bitbones`, lowercase.

### Protocol Hook Rules

- `useFeed`, `useCommunity`, `useCommunityStats` and `useCommunitiesStates` take a
  `CommunityIdentifier` (`{name}` or `{publicKey}`), never an address string. Go through
  `src/hooks/use-community-identifier.ts`. Passing an address silently returns nothing — no throw,
  no console error, just an empty feed or a blank community header.
- `useSubscribe` is the exception: it still takes a plain `communityAddress` string.
- Every hook argument must be an object or `undefined`. The library asserts
  `arg == null || typeof arg === 'object'`, so a falsy-non-null value such as `cond && options`
  throws mid-render — and this app has no error boundary, so the view goes blank. Write
  `cond ? options : undefined`.
- Both traps are documented with full context in `docs/agent-playbooks/known-surprises.md`.

### Package and Dependency Rules

- Use Corepack-managed Yarn 4, never `npm`. Run `corepack enable` once on a new machine before using `yarn`.
- Pin exact dependency versions (`package@x.y.z`), never `^` or `~`. Prefer the exact version a
  sibling client in this org already ships when the package is shared — that is the proven-good version.
- Keep `yarn.lock` synchronized when dependency manifests change.

### React Architecture Rules

- Do not use `useState` for shared/global state. Use a small zustand store in `src/hooks/`.
- Do not use `useEffect` for data fetching. Use `@bitsocial/bitsocial-react-hooks`.
- Do not sync derived state with effects. Compute during render.
- Avoid copy-paste logic across components. Extract custom hooks in `src/hooks/`.
- Avoid boolean flag soup for complex flows; prefer the `state` / `updatingState` value the protocol hook already returns.
- Use React Router for navigation; no manual history manipulation. Routing is `HashRouter`, so any
  URL you construct by hand needs the `#` segment.

### TypeScript Rules

- Everything under `src/` is `.ts`/`.tsx`. Never add a `.js`/`.jsx` file there, and never turn on `allowJs`.
- No `any`, and no `@ts-ignore` / `@ts-expect-error`. If a type fights you, fix the type.
- Import domain types (`Comment`, `Community`, `Account`, `CommunityIdentifier`, ...) from
  `@bitsocial/bitsocial-react-hooks`. Do not hand-roll a local copy of a type the library exports.
- Type props with an `interface XProps { ... }` declared directly above the component. No `React.FC`.
- Keep relative imports extensionless (`./use-theme`, not `./use-theme.ts`).
- Extend `src/modules.d.ts` (CSS modules), `src/env.d.ts` (`import.meta.env`), or `src/globals.d.ts`
  (`Window` extras) rather than adding a fourth ambient file. Which of the three depends on the
  declaration kind, and the two are not interchangeable: `src/modules.d.ts` is a global *script*, so
  it holds ambient `declare module` shims for dependencies that ship no typings (`ext-name`, and the
  CSS-module shim). `src/globals.d.ts` is a *module* (it ends in `export {}`), so it holds global
  augmentations of packages that DO ship typings — `declare module 'react'` to add attributes React
  renders but does not type. Putting an augmentation in `modules.d.ts` silently replaces the
  package's real typings instead of extending them, which breaks every import from it.
- `electron/`, `scripts/`, `vite.config.js`, and `forge.config.js` are outside `tsconfig.json`'s
  `include` and stay plain JavaScript.

### Code Organization Rules

- Keep views thin. A view should read as: call one hook, render its result.
- Keep components focused; split large components.
- Follow DRY: shared UI in `src/components/`, shared logic in `src/hooks/`.
- Add comments for complex/non-obvious code; skip obvious comments.

### Git Workflow Rules

- Keep `master` releasable. Do not treat `master` as a scratch branch.
- If the user asks for a reviewable feature/fix and the current branch is `master`, create a short-lived task branch before making code changes unless the user explicitly asks to work directly on `master`.
- Name short-lived AI task branches by intent: `feature/*`, `fix/*`, `docs/*`, `chore/*`.
- Open PRs from task branches into `master` so review bots can run against the actual change.
- Open PRs as ready for review, not draft. Draft PRs prevent CodeRabbit, Cursor Bugbot, and similar review bots from running.
- Use worktrees only when parallel tasks need isolated checkouts. One active task branch per worktree, named descriptively after the task (`fix-blank-community-header`, not `wt1` or `tmp`).
- If a new task is unrelated to the currently checked out branch, do not stack it on that branch. Create a new worktree from `master` and a separate short-lived task branch there.
- After a reviewed branch is merged, prefer deleting it to keep branch drift and merge conflicts low.

### Bug Investigation Rules

- For bug reports tied to a specific file/line, check relevant git history before any fix.
- Minimum sequence: `git log --oneline` or `git blame` first, then scoped `git show` for relevant commits.
- Full workflow: `docs/agent-playbooks/bug-investigation.md`.

### Verification Rules

- Never mark work complete without verification.
- After code changes, run: `yarn lint`, `yarn type-check`, `yarn build`.
- After React UI logic changes, also run `yarn doctor`. Treat react-doctor output as guidance for
  *newly introduced* issues, not as an aggregate score to grind up: many `error`-level diagnostics
  flag intentional patterns or current React-Compiler limitations.
- After dependency or import-graph changes, run `yarn knip`.
- `yarn type-check` (`tsc --noEmit`) is the type gate; run it after any change under `src/`.
- There is no test command. If a checklist asks for one, say it does not exist here rather than
  inventing a command.
- `yarn build` runs `yarn sync:lists` first and can rewrite the tracked `src/data/vendored-*.json`
  mirrors. Review that diff and keep or discard it deliberately.
- Do not commit or force-add local rebuild output. `build/` is the generated build output; remove it
  after local verification before committing.
- For UI/visual changes, open the route with `yarn start` and check desktop plus a mobile viewport by hand.
- The shared hook verification path is strict by default. Only set `AGENT_VERIFY_MODE=advisory` when you intentionally need signal from a broken tree without blocking the session.
- If verification fails, fix and re-run until passing.

### Tooling Constraints

- Use `gh` CLI for GitHub work (issues, PRs, actions, dependabot, search).
- Do not use GitHub MCP.
- Do not use browser MCP servers.
- If many MCP tools are present in context, warn the user and suggest disabling unused MCPs.

### AI Tooling Rules

- Treat `.codex/`, `.cursor/`, and `.claude/` as repo-managed contributor tooling, not private scratch space.
- Keep equivalent workflow files aligned across all toolchains when their directories contain the same skill, hook, or agent. `yarn ai-workflow:check` enforces this.
- Keep shared behavior equivalent while preserving harness-specific models, config formats, hook entry points, and tool invocation syntax.
- Hook implementations in this repo are self-contained inside each toolchain directory, not wrappers around a shared script. Edit `.claude/hooks/<name>.sh` first, then mirror it verbatim into `.cursor/hooks/` and `.codex/hooks/`, rewriting only the `.claude/` path token. Keep every hook executable.
- Hook entry points are harness-specific: the `hooks` key in `.claude/settings.json` (Claude Code does not read a standalone hooks.json), `.cursor/hooks.json` (Cursor schema), and `.codex/hooks.json` (Codex schema, intentionally Claude-compatible).
- Do not configure `.claude` agents to use a Cursor-only model such as `composer-2`. Keep `.claude` agent models on Claude-supported options; judgment-tier agents omit `model:` entirely so they inherit the session model.
- Do not pin `model` or `model_reasoning_effort` in committed Codex custom-agent TOMLs under `.codex/agents/*.toml`; omit both so subagents inherit the current parent settings.
- If `AGENTS.md` references a skill, agent, or hook, prefer a tracked file under `.codex/`, `.cursor/`, or `.claude/` rather than an untracked local-only instruction.
- Review `.codex/config.toml`, `.codex/hooks.json`, `.cursor/hooks.json`, and `.claude/settings.json` before changing agent orchestration or hook behavior.
- Before finishing any React UI logic change under `src/components`, `src/views`, `src/hooks`, `src/lib`, or `src/app.tsx`, review the changed diff with `vercel-react-best-practices`. Fix valid findings before final verification.
- When a diff adds new `useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useMemo`, `useCallback`, or `memo(...)` usage under `src/`, treat the repo hook reminder as mandatory and reconsider the change with `you-might-not-need-an-effect` before finishing.
- For work expected to span multiple sessions, keep explicit task state in a `feature-list.json` plus `progress.md` pair using `docs/agent-playbooks/long-running-agent-workflow.md`.
- If more than one human or toolchain needs the same task state, keep it in a tracked location such as `docs/agent-runs/<slug>/` instead of a tool-specific hidden directory.

### Security and Boundaries

- Never commit secrets or API keys.
- Never push to a remote unless the user explicitly asks.
- Never push a release tag without explicit approval — the tag is what publishes.
- Test responsive behavior on a mobile viewport.

## Core SHOULD Rules

- Keep context lean: delegate heavy/verbose tasks to subprocesses when available.
- For complex work, parallelize independent checks.
- Use `yarn knip` when adding/removing dependencies or introducing new direct imports; resolve real issues before finishing.
- When proposing or implementing meaningful code changes, include both:
  - a Conventional Commit title suggestion
  - a short GitHub issue suggestion

  Use the format playbook: `docs/agent-playbooks/commit-issue-format.md`.
- When stuck on a bug, search the web for recent fixes/workarounds.
- After user corrections, identify root cause and apply the lesson in subsequent steps.

## Default Community Lists

`src/data/vendored-*.json` are generated by `yarn sync:lists` from bitsocialnet/lists. Never hand
edit them. `src/lib/default-lists.ts` layers memory -> localStorage (1h TTL) -> vendored mirror and
refreshes in the background; caches are keyed per source so switching the default list cannot serve
one client's list under the other's name.

## Local Development URLs

`yarn start` serves the app through [portless](https://github.com/vercel-labs/portless) at
https://bitbones.localhost. Other Bitsocial projects use the same proxy, so they can run
simultaneously without port conflicts.

To bypass portless: `PORTLESS=0 yarn start` (http://localhost:5173).

## Common Commands

```bash
corepack yarn install
yarn start                # https://bitbones.localhost
yarn build
yarn lint
yarn type-check
yarn knip
yarn knip:full
yarn doctor
yarn retest:quality       # build + lint + type-check + knip + doctor
yarn prettier
yarn electron
yarn ai-workflow:check
yarn llms:generate
yarn i18n:update:dry --key <name>   # requires --key
yarn sync:lists
```

## Playbooks (Load On Demand)

Use these only when relevant to the active task:

- Hooks setup and scripts: `docs/agent-playbooks/hooks-setup.md`
- Skills/tools index, MCP rationale, and what is deliberately not committed: `docs/agent-playbooks/skills-and-tools.md`
- Known surprises log: `docs/agent-playbooks/known-surprises.md`
- Bug investigation workflow: `docs/agent-playbooks/bug-investigation.md`
- Commit/issue output format: `docs/agent-playbooks/commit-issue-format.md`
- Long-running agent workflow: `docs/agent-playbooks/long-running-agent-workflow.md`
- Android build notes: `docs/android.md`
