# AGENTS.md

## Purpose and priority

Shared instructions for agents working on bitbones. Explicit user instructions take precedence over repository workflow guidance. MUST rules are requirements; SHOULD rules are defaults. Read linked playbooks only when relevant.

Define completion for non-trivial work and continue through implementation, appropriate verification, and fixes within the requested scope. Use judgment for routine choices; ask only when missing information materially changes the result or an action lacks authorization. Skills do not create additional approval gates.

## Product and source of truth

bitbones is a bare bones GUI client for the Bitsocial protocol. Its minimalism is the product: every view should keep the protocol hook and result legible, without unrelated styling opinions or product features. Preserve HashRouter and the static, serverless client shell; community/post content comes from peers, not the app origin.

Source, manifests, tests, docs, and runtime evidence establish behavior. AGENTS, skills, playbooks, task logs, and generated `llms*.txt` orient the agent; verify technical claims against source. Check the installed dependency version before assuming a sibling repository provides its implementation.

Record recurring repository surprises with concrete mitigation in [known-surprises.md](docs/agent-playbooks/known-surprises.md) after contributor confirmation. Continue independent work while any needed detail is unresolved.

## Working principles

- Understand the affected flow before editing. Prefer skipping unnecessary work, reusing repository code, native/standard-library features, then installed dependencies before adding code.
- Preserve unrelated edits. Keep changes scoped; avoid adjacent cleanup or broad reformatting without a task reason.
- Simplicity must preserve correctness, validation, accessibility, security, error handling, and useful tests.
- For a bug tied to a file/line, inspect `git log` or `git blame`, then relevant `git show`. Use reproduction or conclusive source/runtime evidence before fixing; see [bug-investigation.md](docs/agent-playbooks/bug-investigation.md).
- Prefer existing evidence before instrumentation. Remove only task-owned temporary logs/artifacts once verification is complete.

## Task router

| Task | Guidance/check |
|---|---|
| Files in a directory with AGENTS.md | Read that directory's instructions |
| Code or automation changed | Select checks by impact in [verification.md](docs/agent-playbooks/verification.md) |
| React state/effects/data flow/performance changed | Read relevant React skill rules; use Doctor when diagnostics resolve a concern |
| UI/layout changed | Verify affected flows; choose browsers/viewports using the verification playbook |
| Translation keys/values | Use `translate`; one writer applies all locale changes |
| `package.json` changed | Run `corepack yarn install` and keep `yarn.lock` synchronized |
| Dependencies/imports changed | Run advisory `yarn knip`; resolve relevant new findings |
| AI workflow files changed | Edit shared sources; run `yarn ai-workflow:sync`, `yarn ai-workflow:check`, `yarn ai-workflow:test` |
| Public English docs or AI context changed | Run `yarn llms:generate` and include resulting tracked indexes |
| Open PR feedback or merge readiness | Use `review-and-merge-pr` within the requested scope |
| Durable handoff/resumption needed | Use [long-running-agent-workflow.md](docs/agent-playbooks/long-running-agent-workflow.md) |
| Protocol hooks called | Check the identifier and argument traps below |
| `src/` changed | Run `yarn type-check`; there is no application test runner |
| Version/release requested | Use `release`; publication starts when an authorized version tag reaches origin |

## Code and product constraints

`src/` is React/TypeScript; `electron/`, `scripts/`, `vite.config.js`, and `forge.config.js` remain JavaScript. Shared UI stores live in `src/hooks/`, not a new `src/stores/` directory. Keep views thin.

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

## Git and ownership

- Keep `master` releasable. Default to short-lived `codex/feature/*`, `codex/fix/*`, `codex/docs/*`, or `codex/chore/*` branches unless the user asks otherwise.
- For an unrelated task on another active branch, use a descriptive worktree from `master`; never switch branches underneath another agent. Related delegated slices may share a checkout with non-overlapping ownership.
- Stage only task-owned changes, using selective patches for mixed files. Do not use `git add -A` by default. Preserve secrets, unrelated edits, and preexisting artifacts during cleanup.
- Only commit, push, publish, or merge when authorized; existing authorization persists through necessary steps. When a PR is requested, target `master` and make it ready for review unless a draft was requested.
- After an authorized merge, remove only the verified merged branch/worktree. Never perform Git cleanup from lifecycle hooks.
- Use `gh` for GitHub operations. Use [commit-issue-format.md](docs/agent-playbooks/commit-issue-format.md) for requested wording or actual commit/issue creation, not automatic suggestions.

## Verification and resources

- Use the narrowest reliable behavior checks first. Run applicable checks once for the final state, repeating only after changes, failures, or unresolved concerns. Preserve explicit CI/release/user requirements.
- Documentation-only work needs document/workflow checks, not an app build. Add regression tests for non-trivial testable bugs, not wording changes.
- Inspect active workloads before heavy work. Serialize installs, builds/full suites, React Doctor, Android/Electron work, and browser profiling across the task. One owner runs heavy verification; never stop processes of unclear ownership.
- Reuse a compatible dev server in the same worktree when safe. Otherwise record and clean up only the processes this task starts; never start a server for documentation-only work.
- Run browser engines sequentially through `./scripts/pw-session.sh open <session> ...` and `close <session>`. One browser is active machine-wide. Exit 75 means busy; defer or use the bounded wait. Close the exact owned session even after failure, never `close-all` or `kill-all`.
- Default to isolated sessions; personal-browser reuse requires authorization. A caller-owned session can be reused by a delegated helper without taking over its lifecycle.
- Review the final task-owned diff. Use `code-quality-review` for non-trivial changes or an explicit review; apply high-confidence in-scope findings. Doctor, Knip, and coverage are diagnostics, not new repository-wide gates.

## Skills and delegation

- Shared skills live in `.agents/skills/`; `.agents/roles/` is the repository's generator source, not a native discovery path. Commit generated `.claude/skills/`, `.codex/agents/`, `.claude/agents/`, and `.cursor/agents/` alongside sources. See [skills-and-tools.md](docs/agent-playbooks/skills-and-tools.md).
- Keep harness-specific hooks, permissions, and metadata explicit. Leave model and reasoning fields out of committed skills/custom agents so runtime invocation, user defaults, and inheritance control selection. Do not invent a `latest` model alias.
- Use built-in worker/explorer roles for ordinary implementation/research; custom roles cover browser checks, profiling, translation, review, and applicable Android checks. Avoid compulsory specialist chains.
- Delegate substantial independent work when it improves speed or context isolation. Give scope, acceptance criteria, context, ownership, and expected evidence. At most four workers by default; no overlapping writes or concurrent browser work.
- Use relevant React guidance for the changed state/effect/data flow; load `you-might-not-need-an-effect` for a focused uncertain effect/memo review. Do not apply Next.js/server rules indiscriminately to Vite clients.
- Prefer installed tools and CLIs. Look up current external APIs when needed; do not install skills merely because a normal task mentions their domain. Keep tool catalogs relevant; unused integrations add choices even when schemas are deferred.

## React diagnostics and visual feedback

Use the pinned React Doctor through `yarn doctor --scope changed --base <base> --blocking none --no-parallel` to investigate the actual task diff. Use `HEAD` for uncommitted work, or the task's starting commit after committing. Run `yarn doctor:scan --help` and follow `profile-browsing` for runtime Chrome traces; serialize its browser with other browser work. React Doctor manages its own isolated Chrome, an exception to the Playwright wrapper; first close owned Playwright sessions, defer if the wrapper reports another active owner, and confirm the scan browser exits before continuing. Diagnose measured costs and relevant new findings without chasing a score.

Development builds expose Agentation for visual annotations and retain `window.__ELEMENT_SOURCE__` for source inspection. Set `window.__PROFILING__ = true` before navigation to suppress the toolbar during automated measurements. Production builds must contain neither inspector.

## Commands and playbooks

Use Node from `.nvmrc` and Corepack-managed Yarn. `yarn start` runs the launcher; `PORTLESS=0 yarn start` serves direct Vite, beginning at port 5173 and advancing if occupied. Use its reported URL and hash routes. `yarn start:preview` serves the production build without dev inspectors.

Checks: `yarn lint`, `yarn type-check`, `yarn build`, advisory `yarn doctor` and `yarn knip`. `yarn build` runs `sync:lists`, which may update tracked `src/data/vendored-*.json`; inspect those changes deliberately. There is no application test runner or `yarn test`; AI tooling has isolated Node fixtures.

Load details when needed: [hooks](docs/agent-playbooks/hooks-setup.md), [verification](docs/agent-playbooks/verification.md), [skills/tools](docs/agent-playbooks/skills-and-tools.md), [long-running work](docs/agent-playbooks/long-running-agent-workflow.md), [known surprises](docs/agent-playbooks/known-surprises.md).
