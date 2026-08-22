# Skills and Tools

Use this playbook when setting up/adjusting skills and external tooling, or to discover what is already committed.

## Committed Skills Index

These live in `.claude/skills/`, `.cursor/skills/`, and `.codex/skills/` (mirrored; run `yarn ai-workflow:check` after edits). No install needed — prefer them over re-implementing the flow by hand.

| Skill | Use when |
|---|---|
| `commit` | Committing current work (splits into logical scoped commits) |
| `commit-format` / `issue-format` | Formatting commit/issue *suggestions* in chat output |
| `make-closed-issue` | Creating an issue + branch + PR into `master` for already-done work |
| `review-and-merge-pr` | Triaging bot/human PR feedback, fixing, merging, cleaning up local git state |
| `fix-merge-conflicts` | Resolving merge conflicts non-interactively and validating the build |
| `release` / `release-description` | Cutting a release / updating the release one-liner |
| `code-quality-review` | Advisory final-diff quality pass before finishing, committing, pushing, or opening a PR |
| `refactor-pass` | Simplicity-focused refactor of recent changes |
| `deslop` | Removing AI-generated slop from the branch diff |
| `debug-agent` | Evidence-based debugging with runtime NDJSON logs |
| `you-might-not-need-an-effect` | Auditing/refactoring `useEffect` anti-patterns |
| `vercel-react-best-practices` | React performance review rules (vendored from Vercel) |
| `translate` | i18next key changes across all 93 languages (spawns `translator` subagents) |
| `implement-plan` | Executing a multi-task plan via parallel `plan-implementer` subagents |
| `readme` | Creating/updating README.md |
| `context7` | Fetching up-to-date library docs |
| `find-skills` | Discovering/installing ecosystem skills |
| `playwright-cli` | Driving a browser: navigating, snapshotting, filling forms, screenshots, tracing |
| `inspect-elements` | Mapping a live DOM node back to the React file that rendered it |
| `profile-browsing` | Web Vitals + react-scan rerender profiling across a batch of routes |

## Committed Subagents

Defined in `.claude/agents/*.md`, `.cursor/agents/*.md`, `.codex/agents/*.toml` (+ `.codex/config.toml` entries): `code-quality`, `plan-implementer`, `react-patterns-enforcer`, `react-doctor-fixer`, `translator`, `browser-check`, `profiler`. Most are driven by the skills above; read the agent file before spawning one directly.

`browser-check` and `profiler` are read-only and both drive a browser. Never run them concurrently, with each other or with anything else that opens a browser: `scripts/pw-session.sh` allows one Playwright browser at a time machine-wide, and competing sessions both saturate the machine and invalidate timing measurements.

## Browser Automation

The `playwright-cli`, `inspect-elements`, and `profile-browsing` skills, plus the `browser-check` and
`profiler` subagents, are ported from the sibling client and adapted to bitbones. Their local
infrastructure is:

| Piece | What it does |
|---|---|
| `scripts/pw-session.sh` | Machine-wide single-browser resource lock around `playwright-cli open`/`close`. Exit 75 means the slot is busy — wait, do not bypass |
| `src/lib/react-scan.js` | Dev-only inspectors: react-scan render report (`__getReactScanReport`), element-source (`__ELEMENT_SOURCE__`), react-grab (`__REACT_GRAB__`) |
| `index.html` | The single `import.meta.env.DEV` guard that loads the module above; nothing in `src/` may import it |
| `playwright` (devDependency) | Browser binaries via `npx playwright install`, and raw Playwright for reproduction scripts |
| `playwright-cli` (global) | `npm install -g @playwright/cli@latest` — not a repo dependency |

Drive the **plain-port** dev server (`PORTLESS=0 yarn start`, http://localhost:5173). The default
`yarn start` fronts Vite with portless on a hostname derived from the current git branch, behind a
locally generated certificate that `playwright-cli open` has no flag to accept. Routing is
`HashRouter`, so every in-app URL needs the `#` segment.

CI greps `build/assets/` for `__REACT_GRAB__|__PROFILING__|__ELEMENT_SOURCE__|getReactScanReport` to
prove the dev-only inspectors never ship. If you expose a new dev-only global, add it to that grep in
`.github/workflows/ci.yml`.

## Deliberately Not Committed Here

The sibling client also ships a `test-apk` skill and agent. It is **not** ported to bitbones: it
drives Android instrumentation tests and media-upload flows, and this repo has neither, so it would
have nothing to exercise.

There is also no test skill or test step, because there is no test runner in this repo. Do not
fabricate `yarn test`.

## Recommended Skills

### Context7 (library docs)

For up-to-date docs on libraries.

```bash
npx skills add https://github.com/intellectronica/agent-skills --skill context7
```

### Vercel React Best Practices

For deeper React performance guidance.

```bash
npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-best-practices
```

### Find Skills

Discover/install skills from the open ecosystem.

```bash
npx skills add https://github.com/vercel-labs/skills --skill find-skills
```

## Local Verification Tools

| Command | What it gives you |
|---|---|
| `yarn start` | Dev server at https://bitbones.localhost via portless (`PORTLESS=0 yarn start` for http://localhost:5173, which is what browser automation should target) |
| `./scripts/pw-session.sh status` | Who holds the machine-wide Playwright browser slot, and whether that browser is still alive |
| `yarn lint` / `yarn build` | The required gate, also enforced by the stop hook |
| `yarn knip` | Manifest/import audit (strict); `yarn knip:full` is the advisory full report |
| `yarn doctor` | react-doctor review of React UI logic; treat it as a reviewer of *new* diagnostics, not a score |
| `yarn ai-workflow:check` | Parity check across `.claude/`, `.cursor/`, `.codex/` |
| `yarn llms:generate` | Regenerates `public/llms*.txt` after public-facing English content changes |
| `yarn i18n:update` / `yarn i18n:update:dry` | Translation key updates across every language file |

## MCP Policy Rationale

Avoid GitHub MCP and browser MCP servers for this project because they add significant tool-schema/context overhead.

- GitHub operations: use `gh` CLI.
- Browser operations: use `playwright-cli` through `scripts/pw-session.sh`, not a browser MCP.
- If many MCP tools are present in context, warn the user and suggest disabling unused MCPs.
