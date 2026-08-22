---
name: commit-format
description: Formats GitHub commit messages following Conventional Commits style with title and optional description. Use when proposing or implementing code changes, writing commit messages, or when the user asks for commit message suggestions.
---

# Commit Format

## Template (copy this structure exactly)

Title only — raw markdown:
```
> **Commit title:** `type(scope): short description here`
```

Title with description — raw markdown:
```
> **Commit title:** `type(scope): short description here`
>
> Description sentence one. Description sentence two with `codeRef()` references.
```

## Rules

1. Use markdown blockquote (`>` prefix) — no exceptions
2. Title goes after `**Commit title:**` wrapped in exactly ONE backtick pair
3. NEVER put backticks inside the title — the whole title is one code span, no nesting
4. Description uses backticks for code references — title does NOT
5. Conventional Commits types: `fix`, `feat`, `perf`, `refactor`, `docs`, `chore`
6. Always include a scope — a short, human-readable area name (e.g. `reply tools`, `challenge modal`, `default lists`), matching how this repo actually commits (see the `commit` skill)
7. Use `perf` for performance optimizations (not `fix`)
7. Description: 2-3 sentences about the solution, no bullet points, only if title isn't enough

## Wrong vs Right

❌ WRONG — missing backticks around title:
```
> **Commit title:** refactor(routing): rename from /profile to /account
```

❌ WRONG — backticks around individual words instead of whole title:
```
> **Commit title:** refactor(routing): rename from `/profile` to `/account`
```

❌ WRONG — missing scope:
```
> **Commit title:** `refactor: rename from /profile to /account`
```

✅ CORRECT — entire title in one backtick pair, no backticks inside, scope present:
```
> **Commit title:** `refactor(routing): rename from /profile to /account`
```

## Self-check

Before outputting, verify:
- [ ] Lines start with `>`
- [ ] Title is wrapped in exactly one backtick pair: `` `like this` ``
- [ ] Title has the form `type(scope): description`
- [ ] No backticks inside the title text
- [ ] Code references in description (not title) use backticks
