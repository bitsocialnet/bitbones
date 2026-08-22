---
name: translate
description: Add or update i18next translation keys across all language files by spawning translator subagents. Use when the user asks to add a new translation, update existing translations, translate text, or work with i18n keys. Triggers on "translate", "add translation", "translation key", "i18n", "localization".
---

# Translate

This skill orchestrates translation of i18next keys by spawning **translator** subagents. Each key gets its own subagent so multiple keys can be translated in parallel.

## How It Works

1. The user provides one or more translation keys (and optionally English values).
2. This skill tells the parent agent to spawn one `translator` subagent per key.
3. Each subagent independently translates its key into all 93 languages and applies the result using `scripts/update-translations.js`.

## Workflow

### Step 1 — Parse the keys

Identify all translation keys from the user's request. Keys may be provided as:
- A comma-separated list: `about_bitbones, loading, submit`
- A numbered/bulleted list
- Inline in a sentence: "translate the key `about_bitbones`"

### Step 2 — Look up English values

For each key, check if the English value already exists in `public/translations/en/default.json`. If the user provided new English text, use that instead.

### Step 3 — Spawn translator subagents

For **each key**, spawn a `translator` subagent using the Task tool with `subagent_type: "translator"`. The prompt for each subagent must include:
- The key name
- The English value
- An instruction to follow the translator subagent's system prompt

Example prompt for a subagent:

```
You are the translator subagent. Translate the following i18next key into all 93 supported languages and apply it using the project's translation script.

Key: about_bitbones
English value: "bitbones is a bare bones gui client for bitsocial"

Follow your system prompt for the full workflow (create dictionary file, dry run, apply, clean up).
```

**Parallelism rules:**
- Spawn up to 4 subagents concurrently.
- If there are more than 4 keys, batch them: spawn 4, wait for completion, then spawn the next batch.

### Step 4 — Report results

After all subagents complete, summarize:
- Which keys were translated successfully
- Any failures or issues

## Other Operations (No Subagent Needed)

For non-translation operations, run the script directly without spawning subagents:

### Copy English value to all languages (fallback only)

Use only when the string is a technical term, brand name, or placeholder.

```bash
node scripts/update-translations.js --key some_key --from en --write
```

### Delete a key from all languages

```bash
node scripts/update-translations.js --key obsolete_key --delete --write
```

### Audit for unused keys

```bash
node scripts/update-translations.js --audit --dry
node scripts/update-translations.js --audit --write
```

`yarn i18n:update` and `yarn i18n:update:dry` are shorthands for the same script.

## Important Flags

| Flag | Description |
|------|-------------|
| `--key <name>` | Translation key to update/delete |
| `--map <file>` | JSON file with per-language values |
| `--include-en` | Include English in updates (required when using `--map`) |
| `--from <lang>` | Source language to copy from (default: en) |
| `--dry` | Preview changes without writing |
| `--write` | Actually write the files |
| `--delete` | Delete the key from all languages |
| `--audit` | Find and remove unused translation keys |

## Naming Rule

Product-name keys use the client's own name (`about_bitbones`). Never write the protocol's former
name or the name of the client bitbones was ported from into a translation value — the protocol is
Bitsocial, the low-level library is PKC, and communities are communities.

## Supported Languages

af, am, ar, az, be, bg, bn, bs, ca, ckb, cs, cy, da, de, el, en, eo, es, et, eu, fa, fi, fr, fy, ga, gd, gl, gu, ha, he, hi, hr, ht, hu, hy, id, ig, is, it, ja, ka, kk, km, kn, ko, ku, ky, lb, lo, lt, lv, mg, mk, ml, mn, mr, ms, mt, my, ne, nl, no, or, pa, pl, ps, pt, ro, ru, rw, si, sk, sl, sn, so, sq, sr, sv, sw, ta, te, th, tl, tr, ug, uk, ur, uz, vi, yi, yo, zh, zu
