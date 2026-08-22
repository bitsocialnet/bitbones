# Generated Playwright Code

Every action you perform with `playwright-cli` echoes the equivalent Playwright code. Collect it to
turn a manual browser check into a script someone else can replay.

**bitbones has no test runner.** There is no vitest, no `yarn test`, and no `@playwright/test`
config in this repo, so generated code is for reproduction scripts and bug reports — attach it to an
issue, or keep it in a scratch file outside the repo. Do not add it as a committed test, and do not
invent a `yarn test` command to run it with.

## How It Works

```bash
# Start a session
playwright-cli open http://localhost:5173/#/settings

# Take a snapshot to see elements
playwright-cli snapshot
# Output shows: e1 [textbox "Address"], e2 [button "Save"]

# Interact - generates code automatically
playwright-cli fill e1 "example.bso"
# Ran Playwright code:
# await page.getByRole('textbox', { name: 'Address' }).fill('example.bso');

playwright-cli click e2
# Ran Playwright code:
# await page.getByRole('button', { name: 'Save' }).click();
```

## Building a Reproduction Script

Collect the generated code into a standalone script that anyone can run against their own dev
server. `playwright` is a devDependency, so this runs with no extra install:

```js
// repro.mjs — run with: node repro.mjs
import { chromium } from 'playwright';

const url = process.env.BITBONES_URL ?? 'http://localhost:5173';

const browser = await chromium.launch();
const page = await browser.newPage();

// Generated code from the playwright-cli session:
await page.goto(`${url}/#/settings`);
await page.getByRole('textbox', { name: 'Address' }).fill('example.bso');
await page.getByRole('button', { name: 'Save' }).click();

console.log(await page.getByRole('alert').textContent());
await browser.close();
```

Remember `HashRouter`: an in-app URL without the `#` segment is a Vite 404, not a bitbones route.

## Best Practices

### 1. Use Semantic Locators

The generated code uses role-based locators when possible, which are more resilient:

```js
// Generated (good - semantic)
await page.getByRole('button', { name: 'Submit' }).click();

// Avoid (fragile - CSS selectors)
await page.locator('#submit-btn').click();
```

### 2. Explore Before Recording

Take snapshots to understand the page structure before recording actions:

```bash
playwright-cli open http://localhost:5173/#/
playwright-cli snapshot
# Review the element structure
playwright-cli click e5
```

### 3. State the Starting State

bitbones keeps its account and subscriptions in browser storage, so a fresh isolated session starts
logged out, with the default community list and no subscriptions. A repro script that depends on
anything else has to set that state up explicitly — say so at the top of the script.
