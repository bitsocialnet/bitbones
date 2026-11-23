// Run with type stripping: node --experimental-strip-types --test scripts/__tests__/challenge-modal-answers.node-test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getChallengeAnswers, getChallengeEntries, publishChallengeAnswers } from '../../src/components/challenge-modal/utils.ts';

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

test('publishes the answers on the publication and reports no error when they are sent', async () => {
  const published = [];
  const errors = [];
  const publication = { publishChallengeAnswers: async (challengeAnswers) => void published.push(challengeAnswers) };
  await publishChallengeAnswers(publication, { 1: 'a' }, (error) => errors.push(error));
  assert.deepEqual(published, [{ 1: 'a' }]);
  assert.deepEqual(errors, []);
});

test('hands a rejection after the challenge exchange ended to onError instead of leaving it unhandled', async () => {
  // what pkc-js 0.0.154 does when the answers come after the publication failed or was stopped
  const exchangeEnded = Object.assign(new Error("publishChallengeAnswers was called after the publication's challenge exchange ended"), {
    code: 'ERR_PUBLICATION_CHALLENGE_EXCHANGE_ENDED',
  });
  const errors = [];
  const publication = { publishChallengeAnswers: () => Promise.reject(exchangeEnded) };
  await assert.doesNotReject(publishChallengeAnswers(publication, { 0: 'a' }, (error) => errors.push(error)));
  assert.deepEqual(errors, [exchangeEnded]);
});
