# Agent Hooks Setup

This repo ships lifecycle hooks shared across Claude Code, Cursor, and Codex. Unlike some sibling
repos, the implementations are **self-contained in each toolchain directory** — `.claude/hooks/`,
`.cursor/hooks/`, `.codex/hooks/` hold the real scripts, not thin wrappers — plus each harness's own
entry-point config. The three copies must stay byte-identical apart from the toolchain path token.
Run `yarn ai-workflow:check` after changing any of this.

## Hooks

| Edit-time / stop | Script | Purpose |
|---|---|---|
| edit-time | `hooks/format.sh` | Auto-format `.ts`/`.tsx`/`.js`/`.jsx`/`.cjs`/`.mjs` after AI edits (`npx oxfmt`) |
| edit-time | `hooks/yarn-install.sh` | Run `corepack yarn install` when the root `package.json` changes |
| edit-time + stop | `hooks/react-pattern-review.sh` | When React UI source changes, remind the agent to run the React best-practice review skills; flag new `useEffect`/memo primitives, and flag protocol-hook calls so the argument traps get checked |
| stop | `hooks/sync-git-branches.sh` | Prune stale refs and delete integrated temporary task branches |
| stop | `hooks/code-quality-review-reminder.sh` | Remind the agent to run the advisory `code-quality-review` skill when the diff is non-trivial |
| stop | `hooks/verify.sh` | Gate `yarn lint`, `yarn type-check` and `yarn build`; keep `yarn npm audit` informational |
| session start (Claude only) | `.claude/hooks/session-start.sh` | `corepack yarn install` when `node_modules` is missing (fresh worktrees) |

`verify.sh` gates lint, type-check and build only. There is no test suite, so nothing else belongs in
the gate. `yarn doctor` and `yarn knip` stay advisory and are run by the agent, not the hook.

## Entry points (harness-specific formats)

The three harnesses wire the same scripts but use different config files and schemas. Do not copy one harness's schema to another.

| Harness | Entry point | Schema | Edit event | Stop event |
|---|---|---|---|---|
| Claude Code | `hooks` key in `.claude/settings.json` | Claude hooks schema; a standalone `.claude/hooks.json` is **not** read | `PostToolUse` matcher `Edit\|Write\|MultiEdit\|NotebookEdit` | `Stop` |
| Cursor | `.cursor/hooks.json` | `{"version": 1, "hooks": {...}}` with Cursor event names | `afterFileEdit` | `stop` |
| Codex | `.codex/hooks.json` | Codex hooks schema (intentionally Claude-compatible: `matcher`, `type: "command"`) | `PostToolUse` matcher includes `apply_patch` | `Stop` |

## How the scripts handle harness differences

- **Stdin shape**: Cursor sends `{"file_path": ...}`; Claude/Codex send `{"tool_input": {"file_path": ...}, "hook_event_name": ...}` with absolute paths. The shared scripts parse both and normalize absolute paths to repo-relative.
- **Skill paths**: each copy points `skill_dir` at its own toolchain's `skills/` directory. That is the only intentional difference between the three copies, and the validator normalizes it away.
- **Surfacing output to the model**: in Claude/Codex, plain stdout from `PostToolUse`/`Stop` hooks with exit 0 is transcript-only and never reaches the model. `react-pattern-review.sh` therefore emits `hookSpecificOutput.additionalContext` JSON on `PostToolUse`. The stop-time reminders (`react-pattern-review.sh`, `code-quality-review-reminder.sh`) stay advisory: their output is visible to the contributor, not injected into the model.
- **Blocking**: `verify.sh` in strict mode exits **2** with a short reason on stderr — the only exit code that blocks the stop and feeds the failure back to the agent in Claude/Codex. It checks `stop_hook_active` to avoid infinite stop loops, and skips entirely when the working tree is clean (read-only sessions). Set `AGENT_VERIFY_MODE=advisory` only when you intentionally need signal from a broken tree without blocking the session.
- **Generated output**: `verify.sh` removes the untracked `build/` and `dist/` directories after running, and reports (never reverts) a `src/data/` diff caused by `yarn sync:lists` running as part of `yarn build`.

Lifecycle hooks do not replace manual verification. For UI or visual changes, still open the affected
route with `yarn start` and check desktop plus a mobile viewport by hand — this repo has no test
suite and no committed browser-automation wrapper.

## Editing rules

- Change behavior in `.claude/hooks/*.sh` first, then mirror the file verbatim into `.cursor/hooks/` and `.codex/hooks/`, rewriting only the `.claude/` path token.
- When adding a hook, wire it in **all three** entry points (or add a documented exemption in `scripts/validate-ai-workflow.mjs`, like Claude's `session-start.sh`). The validator checks that every entry point references the same set of `hooks/<name>.sh` scripts.
- Keep every hook executable (`chmod +x`).
- Do not paste "example" hook implementations into docs — link the real scripts so they cannot drift.
