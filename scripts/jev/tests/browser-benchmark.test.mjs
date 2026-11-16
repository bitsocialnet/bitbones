import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePairs, main, readBenchmarkPlan, benchmarkRun } from '../browser-benchmark.mjs';
import { runBrowserPlan } from '../browser-plan.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('paired timing excludes warmups, failures and different action histories, and separates model runs', () => {
  const make = (sample, transport, extra = {}) => ({
    case: 'a',
    sample,
    transport,
    mode: 'deterministic',
    status: 'completed',
    actions: ['click'],
    assertions: [true],
    lifecycleMs: transport === 'old' ? 200 : 100,
    controlCalls: transport === 'old' ? 12 : 7,
    adapterMode: transport === 'old' ? 'legacy-separate' : 'combined-aria',
    ...extra,
  });
  const runs = [
    make(0, 'old'),
    make(0, 'combined'),
    make(1, 'old', { status: 'incomplete' }),
    make(1, 'combined'),
    make(2, 'old'),
    make(2, 'combined', { actions: ['different'] }),
    make(3, 'old', { warmup: true }),
    make(3, 'combined', { warmup: true }),
    make(0, 'old', { mode: 'jev' }),
    make(0, 'combined', { mode: 'jev', lifecycleMs: 300, adapterMode: 'snapshot-command' }),
  ];
  const result = summarizePairs(runs);
  assert.equal(result[0].pairs, 3);
  assert.equal(result[0].comparablePairs, 1);
  assert.equal(result[0].medianPairedReductionFraction, 0.5);
  assert.equal(result[1].medianPairedReductionFraction, -0.5);
  assert.deepEqual(result[1].combinedAdapterModes, ['snapshot-command']);
});

test('benchmark rejects empty scopes and excessive samples or model budgets before launching anything', async () => {
  await assert.rejects(main([]), /invalid_benchmark_options/);
  for (const args of [
    ['--samples', '0'],
    ['--warmups', '3'],
    ['--max-cost-usd', '0.03'],
  ]) {
    await assert.rejects(main(['--plan', 'absent.json', '--baseline-root', '/absent', ...args]), /invalid_benchmark_options/);
  }
});

test('plan reader is bounded and refuses non-files and symlinks before browser execution', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jev-benchmark-input-'));
  try {
    const file = path.join(directory, 'plan.json');
    await fs.writeFile(file, '{"version":1}');
    assert.deepEqual(await readBenchmarkPlan(file), { version: 1 });
    await fs.symlink(file, path.join(directory, 'link.json'));
    await assert.rejects(readBenchmarkPlan(path.join(directory, 'link.json')));
    await assert.rejects(readBenchmarkPlan(directory));
    await fs.writeFile(file, 'x'.repeat(100001));
    await assert.rejects(readBenchmarkPlan(file), /invalid_benchmark_plan/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('deterministic pairs of a plan with semantic checks are timed, while review and cleanup failures stay excluded', async () => {
  const plan = {
    version: 1,
    url: 'http://127.0.0.1:4173/',
    goal: 'Show the settings button.',
    actions: [{ id: 'open', op: 'click', role: 'button', name: 'Settings' }],
    requiredActions: [],
    assertions: [{ type: 'bodyClass', value: 'dark', present: true }],
    semanticChecks: [{ id: 'clarity', role: 'status', name: '', criterion: 'Explains next action' }],
  };
  const driver = (closeError) => () => ({
    open: async () => {},
    observe: async (assertions) => ({ url: plan.url, snapshot: '- button "Settings" [ref=e1]', ...(assertions && { assertions: assertions.map(() => true) }) }),
    close: async () => {
      if (closeError) throw closeError;
    },
  });
  const run = async (sample, transport, closeError) => ({
    case: 'a',
    sample,
    transport,
    mode: 'deterministic',
    ...(await benchmarkRun(plan, { createDriver: driver(closeError), runPlan: runBrowserPlan, baseline: true })),
  });
  const runs = [await run(0, 'old'), await run(0, 'combined'), await run(1, 'old'), await run(1, 'combined', new Error('close failed'))];
  assert.deepEqual(
    runs.map(({ status, flowCompleted, reason }) => [status, flowCompleted, reason]),
    [
      ['incomplete', true, 'semantic_not_run'],
      ['incomplete', true, 'semantic_not_run'],
      ['incomplete', true, 'semantic_not_run'],
      ['incomplete', true, 'cleanup_failed'],
    ],
  );
  const [deterministic] = summarizePairs(runs);
  assert.equal(deterministic.pairs, 2);
  assert.equal(deterministic.comparablePairs, 1);
  assert.equal(typeof deterministic.oldMedianMs, 'number');

  const reviewed = (transport) => ({ ...runs[0], transport, mode: 'jev', reason: 'semantic_review_required' });
  assert.equal(summarizePairs([reviewed('old'), reviewed('combined')])[0].comparablePairs, 0);
});
