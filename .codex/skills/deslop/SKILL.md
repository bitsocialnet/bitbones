---
name: deslop
description: Scan recent changes for AI-generated code slop and remove it. Use when the user says "deslop", "remove slop", "clean up AI code", or asks to remove AI-generated artifacts from the codebase.
disable-model-invocation: true
---

# Remove AI Code Slop

Scan the diff against master and remove AI-generated slop introduced in this branch.

## Workflow

1. **Get the diff**

   ```bash
   git diff master...HEAD
   ```

   If there are also uncommitted changes, include them:
   ```bash
   git diff master
   ```

2. **Scan each changed file** for the slop categories below
3. **Fix** each instance — remove or rewrite to match the surrounding code style
4. **Verify** the build still passes:
   ```bash
   yarn lint && yarn build
   ```
5. **Report** a 1-3 sentence summary of what you changed

## Slop Categories

### Unnecessary comments

AI loves adding comments that restate the code. Remove comments that a human wouldn't write. Keep comments that explain *why* — domain reasoning, constraints, trade-offs, or non-obvious intent.

```jsx
// ❌ Slop — restates the code
const [count, setCount] = useState(0); // Initialize count state to 0

// ❌ Slop — obvious from context
// Fetch the comment data
const comment = useComment({ commentCid });

// ✅ Keep — explains non-obvious intent
// these four hooks need a CommunityIdentifier; an address string fails silently
const communities = useCommunityIdentifiers(communityAddresses);
```

### Excessive defensive checks

AI adds try/catch blocks and null guards everywhere, even on trusted codepaths. Remove guards that the surrounding code doesn't need.

```jsx
// ❌ Slop — bitsocial-react-hooks already handles errors internally
try {
  const { feed } = useFeed({ communities });
} catch (error) {
  console.error('Failed to fetch feed:', error);
}

// ✅ Clean — just use the hook directly
const { feed } = useFeed({ communities });
```

### Defensive shapes that hide the real bug

bitbones is plain JavaScript, so there is no compiler to appease — but AI still reaches for
`?? {}`, `|| []`, or `String(x)` wrappers to make a symptom go away. Remove the wrapper and fix the
value at its source. One exception is load-bearing here: hook arguments must be an object or
`undefined`, never a falsy-non-null value, because the hooks library asserts on that and throws
mid-render.

### Inconsistent style

Any pattern that doesn't match the rest of the file: different naming conventions, different import ordering, unnecessary abstractions, or overly verbose code where the file is concise.

### Over-engineering

AI tends to add unnecessary abstractions, utility functions, or wrapper components that obscure simple logic. If a one-liner was wrapped in a helper, unwrap it.

## Judgment Call: When to Keep Comments

Comments are necessary when code expresses:
- Non-obvious intent or domain-specific reasoning
- Constraints that aren't apparent from the implementation
- Trade-offs or "why not X" decisions
- Workarounds with context on when they can be removed

When in doubt, check if similar code nearby has comments. Match the file's existing comment density.
