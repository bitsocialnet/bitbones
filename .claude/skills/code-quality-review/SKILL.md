---
name: code-quality-review
description: Advisory code quality review for current diffs before finishing, committing, pushing, or opening a PR. Use when asked to review code quality, run a final quality pass, inspect AI-generated changes, or check for over-engineering. Reports actionable suggestions only; does not block or edit unless explicitly asked.
---

# Code Quality Review

Run an advisory review of the current diff. This is a suggestion pass for the author before finishing, committing, pushing, or opening a PR, not a blocking CI gate.

## Scope

- If the user supplies a base, review against that base.
- Otherwise review branch changes against `master` plus any staged, unstaged, or untracked files.
- Read `AGENTS.md` and any nested `AGENTS.md` files that cover changed paths. It is the canonical house-rules doc for this repo.
- Skim nearby source before judging a hunk. Do not review from the patch alone when surrounding patterns matter.
- Do not re-run or duplicate deterministic tools such as `yarn build`, `yarn lint`, `yarn knip`, or `yarn doctor`. Mention them only when the diff suggests they are especially relevant.

## Review Process

1. Establish intent from the user request, issue or PR text if present, and the branch name. If intent is unclear, state assumptions.
2. Read the change against the surrounding code first. There are no tests in this repo, so intended behavior has to come from the request, the diff, and the existing patterns.
3. Review implementation with nearby source open. Compare against existing patterns before suggesting a new one.
4. Verify the verification story. Note missing build checks, screenshots, or manual checks only when their absence leaves concrete risk. There is no test suite in this repo — do not ask for one as a matter of course.
5. Try to disprove non-trivial claims before accepting them: edge cases, error paths, trust boundaries, state transitions, ordering, idempotence, and rollback behavior.

## Ponytail Simplicity Pass

After understanding intent and tracing the affected flow, run this ordered pass, adapted from [Ponytail](https://github.com/DietrichGebert/ponytail). Stop at the first safe replacement that fully preserves the requested behavior:

1. Is the change necessary? Suggest deleting unrequested or speculative work.
2. Does the repository already solve it? Reuse an existing helper, type, component, or pattern.
3. Does the standard library solve it? Prefer that over custom code.
4. Does a native platform feature solve it? Prefer that over code or a dependency.
5. Does an already-installed dependency solve it? Reuse it before adding another dependency.
6. Can the same behavior be expressed more directly without hiding intent or edge cases?
7. Otherwise, keep only the minimum new code that works.

Use this as a focused delete-or-replace pass, not line golf. A small diff in the wrong layer, or one that drops clarity, validation, error handling, security, or accessibility, is not simpler.

## Review Lenses

1. **Correctness**: check whether the change matches the requested behavior. Look for null, empty, boundary, race, async ordering, state consistency, and error-path gaps. In this repo, also check that hook arguments are objects or `undefined` — a falsy-non-null value such as `cond && obj` throws inside the hooks library mid-render, and there is no error boundary.
2. **Documented standards**: flag clear drift from `AGENTS.md`, directory rules, or `docs/agent-playbooks/known-surprises.md`. In this repo that includes the protocol-hook traps: the four hooks that need a `CommunityIdentifier` instead of an address string, and falsy-non-null hook arguments that throw mid-render.
3. **Simplicity**: apply the Ponytail pass to speculative abstractions, wrappers with one caller, new configuration nobody sets, boilerplate, or code that repository patterns, the standard library, a native platform feature, or an existing dependency already cover.
4. **Structure**: look for wrong-layer logic, conditionals growing into state machines, duplicated helpers, file-size sprawl, unclear ownership, or casts and optionality that blur trust boundaries.
5. **Interface and testability**: prefer deep modules with small useful interfaces over shallow pass-through modules. This repo has no test suite, so weigh whether risky logic is at least reachable and observable from the UI, and say so plainly instead of asking for tests that have nowhere to live.
6. **Security and performance**: treat user input, external service responses, config, and LLM output as untrusted at boundaries. Check auth, secrets/logging, injection/XSS/SSRF, N+1 queries, unbounded fetches, expensive rerenders, bundle growth, layout shift, and missing pagination only when touched by the diff.
7. **Dependency discipline**: when a dependency is added or upgraded, ask whether the existing stack already solves it, whether it affects bundle/runtime cost, whether it is maintained, whether the license fits, and whether it increases supply-chain risk.
8. **Scope control**: identify behavior that was not requested, changes unrelated to the task, mixed feature/refactor work that should be split, or cleanup outside the touched area.

## Review Discipline

- Do not rubber-stamp. A green build is necessary but not sufficient; it does not prove architecture, security, accessibility, or maintainability.
- Treat AI-generated code as needing extra scrutiny because it can be plausible and wrong.
- Prefer boring, obvious code. Fewer lines are not automatically simpler; preserve behavior, useful names, and clear error handling.
- Quantify impact when possible. `This can issue one query per row` is better than `this might be slow`.
- If a change is too large to review confidently, suggest a split strategy instead of pretending the whole diff was reviewed deeply.

## Output

- If there are no high-confidence findings, say: `No high-confidence advisory findings. Ship.`
- Otherwise report at most 8 findings, ordered by expected payoff.
- Use this format: `[correctness|standard|simplicity|structure|testability|security|performance|dependency|scope] path:line - Finding. Suggestion. Confidence: high|medium.`
- Keep findings specific and actionable. Skip nits, style preferences, and anything the repo tooling already handles.
- End with `Advisory only; not a blocker.`

## Boundaries

- Do not suggest deleting accessibility, security checks, trust-boundary validation, data-loss protection, or error handling unless you provide an equally safe simpler replacement.
- Do not ask to remove code you do not understand. First explain what evidence would prove it is dead or redundant.
- Respect documented product constraints and historical decisions. If a suggestion appears to contradict an ADR, known surprise, or explicit repo policy, call that out instead of presenting it as a straightforward cleanup.
- Do not edit files unless the user explicitly asks you to apply the review findings.
