# Commit and Issue Format

Use this when proposing or implementing meaningful code changes.

The committed `commit-format` and `issue-format` skills are the canonical, stricter templates (with self-checks); prefer them when the harness loads skills. This playbook is the short fallback summary — keep the two in sync.

## Commit Suggestion Format

- **Title:** Conventional Commits style with a required scope (`type(scope): description`), short, wrapped in backticks. The scope is a short human-readable area name, matching how this repo commits (see the `commit` skill).
- Use `perf` (not `fix`) for performance optimizations.
- **Description:** Optional 2-3 informal sentences describing the solution. Concise, technical, no bullet points.

Example:

> **Commit title:** `fix(default lists): keep the seedit cache out of the other client's key`
>
> Keyed the localStorage entry per source in `default-lists.js` so switching lists cannot serve one client's list under the other's name.

## GitHub Issue Suggestion Format

- **Title:** As short as possible, wrapped in backticks.
- **Description:** 2-3 informal sentences describing the problem (not the solution), present tense.

Example:

> **GitHub issue:**
> - **Title:** `Community header stays blank when an address is passed instead of an identifier`
> - **Description:** The community page renders an empty header for some routes. `useCommunity()` is given a raw address string instead of a `CommunityIdentifier`, and the hook returns nothing without throwing or logging.
