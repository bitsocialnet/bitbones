# Verification

Select checks from the changed behavior and remaining uncertainty. Reuse successful evidence for the same final state; rerun after relevant edits or failures. Explicit CI/release/user requirements still apply.

| Change | Appropriate checks |
|---|---|
| Prose/comments/formatting only | Diff, references, relevant generators; no app build |
| AI workflow sources/configuration | `yarn ai-workflow:sync`, `yarn ai-workflow:check`, `yarn ai-workflow:test`; regenerate LLM indexes when context changed |
| Isolated helper or script | Focused invocation/fixtures and syntax or type/lint checks for the affected code |
| Shared runtime, dependency, build, integration change | Focused affected checks plus the relevant build/type/lint checks below |
| CSS/theme/layout only | Affected routes/viewports/themes in selected browsers; build when imports, assets, or CSS processing changed |
| React state/effects/performance | Affected behavior and applicable React guidance; `yarn doctor:check` and affected `yarn perf:check` scenarios |

## Project checks

- Any `src/` change requires `yarn type-check` (`tsc --noEmit`); TypeScript is strict and `allowJs` stays false.
- Shared runtime/dependency/build changes use `yarn agent:verify` for sequential build/lint/type-check/Doctor/runtime checks. `yarn retest:quality` adds Knip; do not run it alongside its constituents.
- There is no general application unit-test runner; `yarn perf:test` validates browser collector compatibility. For new automation, isolated Node fixtures can verify behavior without inventing an application test command.
- `yarn build` refreshes tracked default lists. Review `src/data/vendored-*.json` changes; never restore unrelated tracked content or remove preexisting artifacts merely to make the tree clean.
- `yarn knip` and Doctor provide diagnostic evidence; resolve relevant new findings rather than chasing a repository score.

## Browser evidence and ownership

Use Chrome for small isolated browser changes. Add Firefox and WebKit for shared CSS/layout/responsiveness, browser-sensitive APIs, broad interactions, releases, or explicit cross-browser criteria. Include affected mobile layouts/touch behavior. A viewport resize alone is not touch emulation. Choose actual routes and content from source rather than assuming examples are available.

Use `playwright-cli` through `./scripts/pw-session.sh`. One browser is active machine-wide; selected engines run sequentially and each exact owned session closes even after failure. Reuse an authorized caller-owned session without closing it. Never use global browser cleanup or stop a server of unclear ownership. No browser/server is needed for documentation-only work.

For performance work, compare the same flow with equivalent viewport, content, network/CPU settings, build mode, and measurement overhead. Distinguish observations from suspected causes. Use the profile skill when these measurements answer the actual request.

## Final evidence

One agent owns heavy verification. Inspect active workloads and serialize installs, builds/full suites, Doctor, Android/Electron work, and browser profiling. Report commands/outcomes and specific limitations; missing data or a skipped engine is not a passing result. Tooling fixtures verify formats and mechanics, not end-to-end app discovery or model decision quality.

## Automated React performance evidence

Run `yarn perf:install` once for the pinned browser, then `yarn perf:check` (three samples at 4x CPU by default). Scope a rerun with `--scenario <name>` when the change affects one covered flow. CI runs the compatibility self-test and scenarios; local `agent:verify` runs scenarios and Doctor automatically. After React/Bippy/collector upgrades, run `yarn perf:test` before relying on the counts. Keep these heavy checks out of per-edit hooks.

`yarn perf:record` keeps JSON and native trace evidence under `.react-perf/`; use `--url <origin>` to reuse a compatible instrumented server. The runner owns its processes and browser lock; run it separately from manual browser sessions. Scenario configuration lives in `scripts/react-perf/config.mjs`. Exact update limits follow the tested interaction; timing caps are deliberately generous smoke limits and must not be relaxed merely to silence a failure. Diagnose a failed phase from its component-instance/commit evidence and visible completion.

Read the `profile-browsing` measurement reference for interpretation and coverage limits. Root Profiler duration measures the subtree, not the self time of each component. A normal production preview lacks this React instrumentation; build and serve `build-profile/` for production-like React timing, leaving the release output untouched.
