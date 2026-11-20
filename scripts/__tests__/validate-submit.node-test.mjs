import assert from 'node:assert/strict';
import test from 'node:test';
import { getSubmitError } from '../../src/components/menu/submit/validate-submit.ts';

test('title-only post is valid, no link or body required', () => {
  assert.equal(getSubmitError({ title: 'hello', communityAddress: 'example.eth' }), undefined);
});

test('missing title is reported first', () => {
  assert.equal(getSubmitError({ title: '', communityAddress: 'example.eth' }), 'missing title');
  assert.equal(getSubmitError({}), 'missing title');
});

test('missing community is reported', () => {
  assert.equal(getSubmitError({ title: 'hello' }), 'missing community');
});
