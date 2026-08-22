---
name: profile-browsing
description: Profile app performance while browsing, collecting Web Vitals and React rerender data via react-scan. Orchestrates sequential profiler subagents via playwright-cli to capture navigation timing, long tasks, layout shifts, LCP, React commit counts, render bursts, and per-component render data without saturating the machine. Use when profiling browsing performance, finding bottlenecks, diagnosing excessive rerenders, or auditing page performance.
---

# Profile Browsing Performance

Two-layer profiling: browser-level symptoms (Web Vitals, long tasks, scroll jank) and React-level diagnosis (commit counts, render bursts, per-component render data from react-scan). Each profiler subagent runs in its own browser session and context window, with only one profiler active at a time.

## Prerequisites

- Dev server running, started with `PORTLESS=0 yarn start` (http://localhost:5173)
- `playwright-cli` installed (`npm install -g @playwright/cli@latest`)

Profile the plain-port dev server, not the portless https one. `yarn start` on its own fronts Vite with portless on a hostname that depends on the current git branch, behind a locally generated certificate that `playwright-cli open` has no flag to accept. Routing is `HashRouter`, so every in-app URL needs the `#` segment.

**IMPORTANT:** The orchestrator (you) is responsible for ensuring exactly ONE dev server is running. Profiler subagents must NEVER start a dev server themselves.

Profile `yarn start` only when you want dev-mode numbers. Vite dev serves unbundled modules and React runs in development mode, so absolute timings are pessimistic; `yarn start:preview` serves the production build if you need realistic numbers. react-scan is dev-only, so the React-level layer is available in dev mode only — say which mode you profiled in the report.

### react-scan (already configured)

`src/lib/react-scan.js` runs react-scan in dev mode. `index.html` loads it behind `import.meta.env.DEV`, which Vite replaces with the literal `false` in a production build, so none of it ships. It:
- Highlights rerendering components visually (toolbar + overlay)
- Accumulates per-component render counts and times via react-scan's `onRender` option
- Exposes `window.__getReactScanReport()` and `window.__resetReactScanReport()` for programmatic collection

`__getReactScanReport()` returns a plain object: `{ ComponentName: { count, time } }`.

**Do not use react-scan's own `getReport()`.** It reads `Store.legacyReportData`, which react-scan 0.5.7 still initializes as an empty `Map` and never writes to, so it always returns an empty `Map`. The live `Store.reportData` is no better: it is only populated while the toolbar is visible *and* a component is manually focused in the inspector, neither of which holds under automation. The app's `onRender` collector exists precisely because of this. Also note a `Map` cannot be serialized — `JSON.stringify(new Map())` is `"{}"` regardless of contents — which is why the collector returns a plain object.

The profiler's `addInitScript` sets `window.__PROFILING__ = true` before the app loads, which tells react-scan to disable its toolbar and sounds during automated runs.

No additional setup needed — react-scan is already a devDependency and loaded by the dev-only guard in `index.html`.

## Step 0: Ensure Dev Server is Running

Before running any profiler subagents, verify exactly one dev server is available:

```bash
BITBONES_URL="${BITBONES_URL:-http://localhost:5173}"
curl -sf "$BITBONES_URL" -o /dev/null && echo "OK" || echo "NOT RUNNING"
```

- If **OK**: proceed to Step 1.
- If **NOT RUNNING**: start one instance with `PORTLESS=0 yarn start` (backgrounded), then poll until it responds. Do NOT start more than one.
- If a dev server is already running on a different port (`scripts/local-server-utils.mjs` walks up from 5173 when it is taken — check `ps aux | grep vite`), reuse it and export `BITBONES_URL` accordingly. Do not start another.

Pass the resolved base URL to every subagent; do not let them guess it.

## Step 1: Define Route Batches

Split routes into batches of 2–4 for sequential profiling. Give every batch a short task-specific session name so unrelated profiling runs cannot collide.

**Default batches** (adjust to the change under review):

| Batch | Session | Routes | Focus |
|-------|---------|--------|-------|
| 1 | `prof-1` | `#/`, `#/catalog` | Default feed + catalog rendering |
| 2 | `prof-2` | `#/p/subscriptions`, `#/p/subscriptions/catalog` | Subscribed-communities feed + catalog |
| 3 | `prof-3` | `#/communities`, `#/p/<communityAddress>` | Community list + a single community feed |

Keep batches balanced. Add a post view (`#/p/<communityAddress>/c/<commentCid>`) when reply rendering is what changed.

A fresh isolated browser session starts with no subscriptions, so batch 2 profiles an empty feed unless you subscribe first. Either drop that batch or have the subagent subscribe through the UI before measuring, and say which you did.

## Step 2: Run Profiler Subagents Sequentially

Read the profiler subagent definition under `.claude/agents/` — the copy for your toolchain, `.md` for Claude and Cursor, `.toml` for Codex. Then spawn one `profiler` subagent for the first batch with your harness's delegation tool (Claude and Cursor: the Task tool with `subagent_type: "profiler"`; Codex: its subagent request with `agent_type: "profiler"`):

```
For each batch, delegate with:
  agent: "profiler"
  prompt: |
    Session name: "prof-N"
    Base URL: http://localhost:5173
    Routes to profile: #/route1, #/route2, ...
    Any extra profiling constraints
```

Wait for that profiler to close its browser and return results before spawning the next batch. Never run profiler or browser-check subagents concurrently: competing browser sessions both saturate the machine and invalidate timing measurements.

## Step 3: Merge Results

Collect structured output from each subagent and merge:

1. Concatenate all Critical / Warning / React Rerenders / Scroll Jank / Info items
2. Combine per-view summary tables into one
3. Merge react-scan component data across routes (same component appearing in multiple routes = sum counts)
4. Deduplicate shared issues (e.g., same slow resource across routes)
5. Sort by severity (Critical first)

## Step 4: Final Report

```markdown
## Performance Profile Results

### Critical
- [metric]: [value] at [route] — [what likely needs fixing]

### Warning
- [metric]: [value] at [route] — [what likely needs fixing]

### React Rerenders
- [route]: [N] commits during load, [M] during scroll — [likely cause]
- Render bursts detected at [routes] — suggests cascading state updates
- Top rerendering components (react-scan):
  - [ComponentName]: [total count] renders across [routes], [time]ms total
  - [ComponentName]: [total count] renders across [routes], [time]ms total

### Scroll Jank
- [route]: [N] long tasks during scroll (max [X]ms), [M] React commits — [likely cause]

### Info
- [observations]

### Per-View Summary
| View | Nav (ms) | Long Tasks | CLS | LCP (ms) | Commits | Scroll Commits | Bursts | Top Component |
|------|----------|-----------|-----|-----------|---------|----------------|--------|---------------|
| #/ | ... | ... | ... | ... | ... | ... | ... | ... |
```

## Interpreting React Metrics

| Signal | Likely cause | Fix direction |
|--------|-------------|---------------|
| High commits, no long tasks | Frequent cheap rerenders | `React.memo`, stabilize props |
| High commits + long tasks | Expensive rerenders | Profile render cost, split components |
| High scroll commits | Scroll/intersection observer triggering renders | Throttle handlers, memoize list rows |
| Render bursts (>5 in 100ms) | Cascading state updates | Batch updates, review zustand selectors |
| react-scan: component with >30 renders | Missing memoization or unstable references | `useMemo`/`useCallback`, check parent renders |
| react-scan: component with >50ms time | Expensive render function | Split component, move work out of render |

Before proposing a fix, re-read the React architecture rules in `AGENTS.md`. Views are deliberately thin wrappers over one hook, and protocol data arrives through `@bitsocial/bitsocial-react-hooks`; a rerender count that tracks incoming protocol updates is the app working, not a bug. Note that `src/main.jsx` renders inside `<StrictMode>`, which intentionally double-invokes renders in dev — halve dev-mode component counts before calling something a hotspot.

## Element-source follow-up

When `react-scan` identifies a rerender hotspot but you still need the exact file behind a concrete DOM node, hand off to `$inspect-elements`.

```bash
playwright-cli -s=prof-followup eval "async el => JSON.stringify(await window.__ELEMENT_SOURCE__.resolve(el))" e7
```

Use `source.filePath` as the direct edit target and `stack` to understand which parent components own the node.

## Step 5: Cleanup

After profiling is complete and the report is delivered, verify no orphaned processes were left behind:

```bash
# Check for any Vite dev servers started during profiling
ps aux | grep 'vite.*--port' | grep -v grep
```

- If the dev server was already running before Step 0, leave it alone.
- If the orchestrator started the dev server in Step 0, kill it now.
- If there are multiple Vite processes (should never happen), kill the extras and warn the user.

Confirm the profiling session released the shared browser slot:

```bash
./scripts/pw-session.sh status
```

If a failed profiler still owns the slot, close that exact recorded session with `./scripts/pw-session.sh close <session>`. A slot whose browser already died is reclaimed by the next `open`, so it needs no manual cleanup. Never use `close-all` or `kill-all` during concurrent agent work.

## Notes

- **Session isolation**: Each subagent uses a short task-specific playwright-cli session (`-s=prof-<task>-N`).
- **Context isolation**: Each subagent runs in its own context window.
- **Per-route collection**: Data resets on each `goto` — the profiler collects before navigating away.
- **Hash routes**: a `goto` between two `#` routes is a same-document navigation, so instrumentation and counters survive it. Only a full-page `goto` (changing the part before `#`) resets them.
- **addInitScript persistence**: Instrumentation re-injects automatically in each new document.
- **Tracing**: Each subagent produces a `trace.zip` under `.playwright-cli/`, viewable in [Trace Viewer](https://trace.playwright.dev).
- **Community addresses**: `#/p/<communityAddress>` takes a full community address; get real ones from `#/communities` or from `src/data/vendored-*.json`.
- **Empty react-scan report**: react-scan is a dynamic import, so `__getReactScanReport()` returns `{}` for the first moment after a `goto`. If it is empty, wait ~1s and re-read before falling back to commit counts + render bursts (still useful, just no component names).
