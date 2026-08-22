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

## Committed Subagents

Defined in `.claude/agents/*.md`, `.cursor/agents/*.md`, `.codex/agents/*.toml` (+ `.codex/config.toml` entries): `code-quality`, `plan-implementer`, `react-patterns-enforcer`, `react-doctor-fixer`, `translator`. Most are driven by the skills above; read the agent file before spawning one directly.

## Deliberately Not Committed Here

Sibling repos ship browser-automation and profiling workflows (`playwright-cli`, `browser-check`,
`inspect-elements`, `profile-browsing`, `profiler`, `test-apk`). They are **not** ported to bitbones
because the infrastructure they assume does not exist here: no `scripts/pw-session.sh` browser
resource lock, no `react-scan` instrumentation module under `src/lib/`, and no Android
instrumentation-test harness. Verify UI changes by hand with `yarn start` instead. If that
infrastructure lands later, port the skills together with it rather than in isolation.

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
| `yarn start` | Dev server at https://bitbones.localhost via portless (`PORTLESS=0 yarn start` for http://localhost:5173) |
| `yarn lint` / `yarn type-check` / `yarn build` | The required gate, also enforced by the stop hook |
| `yarn knip` | Manifest/import audit (strict); `yarn knip:full` is the advisory full report |
| `yarn doctor` | react-doctor review of React UI logic; treat it as a reviewer of *new* diagnostics, not a score |
| `yarn ai-workflow:check` | Parity check across `.claude/`, `.cursor/`, `.codex/` |
| `yarn llms:generate` | Regenerates `public/llms*.txt` after public-facing English content changes |
| `yarn i18n:update` / `yarn i18n:update:dry` | Translation key updates across every language file |

## MCP Policy Rationale

Avoid GitHub MCP and browser MCP servers for this project because they add significant tool-schema/context overhead.

- GitHub operations: use `gh` CLI.
- If many MCP tools are present in context, warn the user and suggest disabling unused MCPs.
