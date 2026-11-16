# Contributing to bitbones

bitbones is a developer client for Bitsocial. Contributions should make it easier to inspect hook calls, protocol data, and runtime behavior while keeping the interface dense and the views thin.

Start with the [README](README.md), [product purpose](PRODUCT.md), [design system](DESIGN.md), [code and product constraints](AGENTS.md#code-and-product-constraints), and [versioning policy](docs/agent-playbooks/versioning.md). The code conventions apply to all contributors; agent-specific workflow lives in `AGENTS.md` and its linked playbooks.

## Setup

Use Node from [.nvmrc](.nvmrc) and the exact Yarn 4 version selected by `packageManager` in [package.json](package.json):

```sh
nvm install
nvm use
corepack enable
yarn install --immutable
yarn start
```

Open the URL printed by the launcher. `PORTLESS=0 yarn start` uses direct Vite, starting at port 5173 and advancing if occupied. Routes use a hash: `/#/` opens the default feed and `/#/settings` opens settings.

`yarn electron:dev` runs the desktop app against the dev server. The separate `yarn electron` command runs a local PKC data cleanup before starting; inspect [the cleanup script](scripts/clear-local-pkc-data.mjs) before using it with data you want to keep.

## What to work on

- Reproducible bugs, clearer protocol inspection, accessibility, and measured performance improvements fit the project. New views should expose protocol hooks and their results.
- Check the [issue backlog](https://github.com/bitsocialnet/bitbones/issues) for existing work. Explain a substantial feature or compatibility change before investing in its implementation.
- For a bug, include the app version or commit, platform, exact route, reproduction steps, expected and actual behavior, and relevant redacted errors. Never include account exports, private keys, or other credentials in reports.
- Trace suspected cross-layer problems through the client and its installed hooks/PKC versions. Fix client rendering here, shared hook behavior in the hooks package, and protocol behavior in PKC once the owning layer is established.

## Implementation conventions

- Preserve the static, serverless client shell and `HashRouter`. Community and post content comes from peers. Use theme tokens in `src/themes.css` for styling.
- Keep `src/` in strict TypeScript, with no `any` or type-check suppression comments. Import domain types from `@bitsocial/bitsocial-react-hooks`. Electron, scripts, and build configuration remain JavaScript.
- Use protocol hooks for data fetching and small zustand stores in `src/hooks/` for shared UI state. Compute derived values during render; avoid effects that synchronize them.
- Follow the [protocol hook rules](AGENTS.md#protocol-hook-rules): use the community-identifier helper where required, and pass an object or `undefined` as hook options.
- Pin dependency versions exactly using Corepack-managed Yarn and include the resulting `yarn.lock` changes. Follow the [translation skill](.agents/skills/translate/SKILL.md) for locale changes.

## Verification

Choose checks using [verification.md](docs/agent-playbooks/verification.md). Run the checks relevant to the final diff and report their results:

- Every `src/` change needs `yarn type-check`. Shared runtime, dependency, or build changes use `yarn agent:verify`, which runs build, lint, types, Doctor, and runtime performance scenarios sequentially. Dependency/import changes also need the advisory `yarn knip` check.
- React state, effects, subscriptions, and rendering changes need `yarn doctor:check` and affected `yarn perf:check` scenarios. Verify visible behavior in the relevant routes and viewports; automated scenarios cover only their configured flows.
- Add a regression check for a non-trivial testable bug using the existing appropriate tooling. There is no general application `yarn test` command. Run `yarn perf:test` after React, Bippy, or collector upgrades.
- Documentation-only changes need a diff/reference check and `yarn llms:generate`, not an app build. Include the regenerated `public/llms*.txt`; register new public documents in `scripts/llms-config.json` when they belong in that context.
- Changes to shared AI workflow sources need `yarn ai-workflow:sync`, `yarn ai-workflow:check`, and `yarn ai-workflow:test`. Edit `.agents/` sources and include their generated compatibility files.

Serialize heavy checks and browser sessions, and stop only processes you own. `yarn build` refreshes tracked `src/data/vendored-*.json`; inspect those changes deliberately.

## Pull requests

- Branch from `master`, target `master`, and keep each pull request focused. Describe the problem, resulting behavior, verification, and any migration or remaining limitation. Include screenshots for visible changes when useful.
- Follow the scoped [Conventional Commit format](docs/agent-playbooks/commit-issue-format.md) for commit and PR titles; use `perf` for performance work.
- Update documentation when supported behavior changes. Preserve unrelated edits and review the final diff before submitting.
- Leave the app version and `CHANGELOG.md` to release preparation unless the task explicitly includes them. Maintainers choose versions using the [versioning policy](docs/agent-playbooks/versioning.md); pushing a version tag triggers publication.
