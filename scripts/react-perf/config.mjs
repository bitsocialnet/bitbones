import assert from 'node:assert/strict';

const settle = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

const prepare = async ({ page }) => {
  await page.addInitScript(() => {
    window.__PROFILING__ = true;
    localStorage.setItem('bitbonesTheme', 'dark');
  });
};

const waitForAccount = async (page) => {
  await page.getByRole('textbox', { name: 'Account JSON', exact: true }).waitFor();
  await page.waitForFunction(() => {
    try {
      const account = JSON.parse(document.querySelector('[aria-label="Account JSON"]').value).account;
      return Boolean(account?.id && account?.signer?.address);
    } catch {
      return false;
    }
  });
};

// Exact counts model local state changes. Timing limits are generous 4x-CPU smoke limits,
// not calibrated latency targets. These settings scenarios do not claim populated feed coverage.
const budget = (component, updates) => ({
  components: { [component]: { minUpdates: updates, maxUpdates: updates } },
  maxCommits: 30,
  maxRenderMs: 1000,
  maxActionMs: 5000,
});

export default {
  targets: [
    {
      name: 'app',
      server: {
        command: ['corepack', 'yarn', 'exec', 'vite', '--host', '127.0.0.1', '--port', '{port}', '--strictPort'],
        env: { REACT_PERF_RUN: '1', PORTLESS: '0', BROWSER: 'none' },
      },
      scenarios: [
        {
          name: 'author-address-draft',
          path: '/#/settings',
          prepare,
          async run({ page, measure }) {
            await waitForAccount(page);
            const input = page.getByRole('textbox', { name: 'Author address', exact: true });
            await input.fill('');
            await settle(page);
            await measure(
              'type-five-characters',
              async () => {
                await input.pressSequentially('Alice');
                assert.equal(await input.inputValue(), 'Alice');
              },
              budget('AuthorAddress', 5),
            );
            await measure(
              'clear-draft',
              async () => {
                await input.fill('');
                assert.equal(await input.inputValue(), '');
              },
              budget('AuthorAddress', 1),
            );
          },
        },
        {
          name: 'account-json-draft',
          path: '/#/settings',
          prepare,
          async run({ page, measure }) {
            await waitForAccount(page);
            const editor = page.getByRole('textbox', { name: 'Account JSON', exact: true });
            const original = await editor.inputValue();
            const draft = original + '\n';
            await settle(page);
            await measure(
              'edit-json-draft',
              async () => {
                await editor.fill(draft);
                assert.equal(await editor.inputValue(), draft);
              },
              budget('AccountSettings', 1),
            );
            await measure(
              'restore-json-draft',
              async () => {
                await editor.fill(original);
                assert.equal(await editor.inputValue(), original);
              },
              budget('AccountSettings', 1),
            );
          },
        },
        {
          name: 'theme-toggle',
          path: '/#/settings',
          prepare,
          async run({ page, measure }) {
            await waitForAccount(page);
            const theme = page.getByRole('combobox', { name: 'Theme', exact: true });
            await settle(page);
            await measure(
              'light-theme',
              async () => {
                await theme.selectOption('light');
                await page.waitForFunction(() => document.body.classList.contains('light'));
              },
              budget('Theme', 1),
            );
            await measure(
              'dark-theme',
              async () => {
                await theme.selectOption('dark');
                await page.waitForFunction(() => document.body.classList.contains('dark'));
              },
              budget('Theme', 1),
            );
          },
        },
      ],
    },
  ],
};
