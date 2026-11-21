// Run with type stripping: node --experimental-strip-types --test scripts/__tests__/load-errors.node-test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatLoadError, getCommentLoadError, getCommunityLoadError, getFeedLoadError } from '../../src/lib/load-errors.ts';

test('a community that failed non-retriably shows its error instead of its updatingState', () => {
  // update() rejected: updatingState ends in 'stopped', useCommunity reports state 'failed'
  const community = { state: 'failed', updatingState: 'stopped', firstLoadFailed: true, error: Error('subscribe failed') };
  const loadError = getCommunityLoadError(community);
  assert.deepEqual(loadError, { failed: true, message: 'subscribe failed' });
  assert.equal(formatLoadError(loadError), 'failed: subscribe failed');
});

test('a failed community whose error has not arrived yet still reads failed', () => {
  assert.equal(formatLoadError(getCommunityLoadError({ state: 'failed', firstLoadFailed: true })), 'failed');
});

test('an unreachable community that pkc-js retries is retrying with its retriable error, not failed', () => {
  const community = { state: 'waiting-retry', updatingState: 'waiting-retry', firstLoadFailed: true, lastRetriableError: Error('timed out') };
  const loadError = getCommunityLoadError(community);
  assert.deepEqual(loadError, { failed: false, message: 'timed out' });
  assert.equal(formatLoadError(loadError), 'first load failed: timed out');
});

test('a community that is loading, loaded, or not requested has no load error', () => {
  assert.equal(getCommunityLoadError({ state: 'fetching-ipns', firstLoadFailed: false }), undefined);
  // a later update error of a community with a record is not a failed load
  assert.equal(getCommunityLoadError({ state: 'succeeded', updatedAt: 1, firstLoadFailed: false, error: Error('update failed') }), undefined);
  assert.equal(getCommunityLoadError(undefined), undefined);
});

test('only a failed useFeed state is a failed feed', () => {
  assert.equal(formatLoadError(getFeedLoadError('failed')), 'failed: every community of the feed failed to load');
  assert.equal(getFeedLoadError('fetching-ipns'), undefined);
  assert.equal(getFeedLoadError('succeeded'), undefined);
  assert.equal(getFeedLoadError(undefined), undefined);
});

test('a comment that failed to load is a load error', () => {
  const loadError = getCommentLoadError({ cid: 'Qm', state: 'failed', error: Error('invalid signature') });
  assert.equal(formatLoadError(loadError), 'failed: invalid signature');
});

test("the account's own failed comment is a failed publication, not a load error", () => {
  assert.equal(getCommentLoadError({ index: 0, state: 'failed', error: Error('publish failed') }), undefined);
  assert.equal(getCommentLoadError({ cid: 'Qm', index: 3, state: 'failed' }), undefined);
});

test('a loading or loaded comment has no load error', () => {
  assert.equal(getCommentLoadError({ cid: 'Qm', state: 'fetching-ipfs' }), undefined);
  assert.equal(getCommentLoadError({ cid: 'Qm', state: 'succeeded', updatedAt: 1 }), undefined);
  assert.equal(getCommentLoadError(undefined), undefined);
});
