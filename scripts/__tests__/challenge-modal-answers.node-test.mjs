// Run with type stripping: node --experimental-strip-types --test scripts/__tests__/challenge-modal-answers.node-test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getChallengeAnswers, getChallengeEntries } from '../../src/components/challenge-modal/utils.ts';

const question = (challenge) => ({ type: 'text/plain', challenge });

test('steps through a CHALLENGE in challenge index order', () => {
  const entries = getChallengeEntries({ 10: question('ten'), 2: question('two'), 0: question('zero') });
  assert.deepEqual(
    entries.map(([challengeIndex]) => challengeIndex),
    ['0', '2', '10'],
  );
});

test('answers sparse challenge indexes under their own keys', () => {
  const entries = getChallengeEntries({ 1: question('first?'), 3: question('second?') });
  assert.deepEqual(
    entries.map(([, challenge]) => challenge.challenge),
    ['first?', 'second?'],
  );
  assert.deepEqual(getChallengeAnswers(entries, { 1: 'a', 3: 'b' }), { 1: 'a', 3: 'b' });
});

test('sends an empty answer for every step left blank, and nothing for keys the CHALLENGE did not ask', () => {
  const entries = getChallengeEntries({ 1: question('first?'), 3: { type: 'url/iframe', challenge: 'https://example.com' } });
  assert.deepEqual(getChallengeAnswers(entries, { 0: 'stale', 1: 'a' }), { 1: 'a', 3: '' });
});
