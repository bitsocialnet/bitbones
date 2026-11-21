// Node strips the types from src/lib/tipping.ts on import, which is why that file has no relative imports.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { keccak256, parseTransaction, recoverMessageAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import {
  buildTipClaim,
  feeRecipientOptionName,
  formatTokenAmount,
  getEthPrivateKeyFromSignerPrivateKey,
  getKeyAddressFromPublicKey,
  getRequiredFee,
  getTip,
  getTipAmountError,
  getTipClaimPublishOptions,
  getTippingConfig,
  getTipFeeConfigError,
  getTipRecipientAddress,
  getTipSendPlan,
  getTipSettleOutcome,
  getTokenKey,
  getProvenWalletAddresses,
  getTipReplies,
  getTipCheck,
  getTipCheckError,
  getVerifiedTip,
  getVerifiedTipTotals,
  getParentBindingSuffix,
  getWalletMessageToSign,
  hasParentBinding,
  verifyWalletProof,
  getWalletProofError,
  normalizeWalletSignature,
  parseTokenAmount,
  sumTips,
  tokensOptionName,
  checkTip,
  verifyTip,
  walletTimestampAllowanceSeconds,
} from '../../src/lib/tipping.ts';
import { ensureBroadcast, ensureRpcChainId, getTokenInfo, getSignedNonce, isTransferDead, signTransfer, simulateTransfer } from '../../src/lib/tipping-chain.ts';

const usdc = '0xA0b86991c6218b36c1d19D4a5e9eB0cE3606eB48';
const dai = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const nft = '0x2222222222222222222222222222222222222222';
const feeRecipient = '0x1111111111111111111111111111111111111111';
const txHash = `0x${'a'.repeat(64)}`;
const feeTxHash = `0x${'b'.repeat(64)}`;

const exampleTokens = [
  { chainId: 1, type: 'native', minAmount: '1000000000000000', fee: { percent: '2' } },
  { chainId: 1, type: 'erc20', address: usdc, minAmount: '1000000', fee: { percent: '2.5' } },
  { chainId: 1, type: 'erc20', address: dai, fee: { amount: '500000000000000000' } },
  { chainId: 1, type: 'erc721', address: nft, fee: { amount: '1000000', token: usdc } },
  { chainId: 1, type: 'erc721', address: '0x3333333333333333333333333333333333333333' },
];

const communityWith = (publicOptions) => ({ challenges: [{ type: 'text/plain' }, { type: 'text/plain', publicOptions }] });
const exampleCommunity = communityWith({ [tokensOptionName]: JSON.stringify(exampleTokens), [feeRecipientOptionName]: feeRecipient });

test('the wallet message is the exact agreed string', () => {
  assert.equal(
    getWalletMessageToSign('12D3KooWScGWHZLpStnX74jENavUzXK4EBVCSRSnHes1JJBdLX5J', '0x5050A4F4b3f9338C3472dcC01A87C76A144b3c9c', 1770000000),
    '{"domainSeparator":"bitsocial-author-wallet","authorPublicKey":"12D3KooWScGWHZLpStnX74jENavUzXK4EBVCSRSnHes1JJBdLX5J","walletAddress":"0x5050a4f4b3f9338c3472dcc01a87c76a144b3c9c","timestamp":1770000000}',
  );
});

test('the key address of a public key matches the one pkc-js derives', () => {
  // a signer created by pkc-js 0.0.148: signer.publicKey and signer.address
  assert.equal(getKeyAddressFromPublicKey('+X1OBktHFm0E1cwKLWu81Va0cAlVhj/i4snOqMz9X2k'), '12D3KooWScGWHZLpStnX74jENavUzXK4EBVCSRSnHes1JJBdLX5J');
  assert.equal(getKeyAddressFromPublicKey('AAAA'), undefined);
  assert.equal(getKeyAddressFromPublicKey('not base64 !'), undefined);
});

test('the in-app wallet key is the 32 signer bytes as hex', () => {
  assert.equal(getEthPrivateKeyFromSignerPrivateKey(btoa(String.fromCharCode(...Array(32).fill(1)))), `0x${'01'.repeat(32)}`);
  assert.equal(getEthPrivateKeyFromSignerPrivateKey(btoa('short')), undefined);
});

const secp256k1Order = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

// the high s form of a signature: s replaced by n - s and v flipped. It recovers the same address.
const toHighS = (signature) => {
  const s = secp256k1Order - BigInt(`0x${signature.substring(66, 130)}`);
  const v = signature.substring(130) === '1b' ? '1c' : '1b';
  return `${signature.substring(0, 66)}${s.toString(16).padStart(64, '0')}${v}`;
};
// the same signature with v written as 0 or 1
const toV01 = (signature) => `${signature.substring(0, 130)}${signature.substring(130) === '1b' ? '00' : '01'}`;

// the test vectors of BSIP-22, copied unchanged from the BSIPs repository
const vectors = JSON.parse(readFileSync(new URL('./fixtures/bsip-22-wallet-proof-vectors.json', import.meta.url), 'utf8'));
const vector = {
  publicKey: vectors.authorKey.publicKeyBase64Unpadded,
  keyAddress: vectors.authorKey.address,
  walletPrivateKey: `0x${vectors.walletPrivateKeyHex}`,
  message: vectors.proofMessage,
  entry: vectors.cases[0].entry,
};
const withSignature = (signature) => ({ ...vector.entry, signature: { ...vector.entry.signature, signature } });

test('the BSIP test vector is a valid proof, and this client produces the same one', async () => {
  assert.equal(getKeyAddressFromPublicKey(vector.publicKey), vector.keyAddress);
  assert.equal(getWalletMessageToSign(vector.keyAddress, vector.entry.address, vector.entry.timestamp), vector.message);
  assert.equal(await getWalletProofError(vector.entry, vector.keyAddress, 1790000000), undefined);
  // the address is compared without regard to letter case
  assert.equal(await getWalletProofError({ ...vector.entry, address: vector.entry.address.toLowerCase() }, vector.keyAddress, 1790000000), undefined);

  const account = privateKeyToAccount(vector.walletPrivateKey);
  assert.equal(account.address, vector.entry.address);
  assert.equal(normalizeWalletSignature(await account.signMessage({ message: vector.message })), vector.entry.signature.signature);
});

test('a proof may be dated at most 300 seconds ahead of the verifier', async () => {
  assert.equal(walletTimestampAllowanceSeconds, 300);
  // valid from the proof's timestamp less the allowance
  assert.equal(await getWalletProofError(vector.entry, vector.keyAddress, 1789999700), undefined);
  assert.equal(await getWalletProofError(vector.entry, vector.keyAddress, 1789999699), 'the wallet timestamp is in the future');
  assert.equal(await getWalletProofError({ ...vector.entry, timestamp: 1790000301 }, vector.keyAddress, 1790000000), 'the wallet timestamp is in the future');
  for (const timestamp of [1790000000.5, '1790000000', undefined]) {
    assert.equal(await getWalletProofError({ ...vector.entry, timestamp }, vector.keyAddress, 1790000000), 'the wallet timestamp is not an integer');
  }
  assert.equal(await getWalletProofError({ ...vector.entry, timestamp: -1 }, vector.keyAddress, 1790000000), 'the wallet timestamp is negative');
});

test('a proof has one accepted signature encoding: v of 27 or 28 and a low s', async () => {
  const now = 1790000000;
  const { signature } = vector.entry.signature;
  // v written as 1 in place of 28
  const v01 = toV01(signature);
  assert.equal(v01.substring(130), '01');
  assert.equal(await getWalletProofError(withSignature(v01), vector.keyAddress, now), 'the wallet signature v is not 27 or 28');
  assert.equal(await getWalletProofError(withSignature(`${signature.substring(0, 130)}00`), vector.keyAddress, now), 'the wallet signature v is not 27 or 28');

  // the high s twin recovers the same address, which is why it has to be rejected by rule
  const highS = toHighS(signature);
  assert.equal(highS.substring(130), '1b');
  assert.equal((await recoverMessageAddress({ message: vector.message, signature: highS })).toLowerCase(), vector.entry.address.toLowerCase());
  assert.equal(await getWalletProofError(withSignature(highS), vector.keyAddress, now), 'the wallet signature s is in the upper half of the curve order');

  for (const malformed of ['0x1234', signature.substring(0, 130), `${signature}00`, signature.substring(2), `0x${'zz'.repeat(65)}`]) {
    assert.equal(await getWalletProofError(withSignature(malformed), vector.keyAddress, now), 'the wallet signature is not 65 bytes of hex');
  }
  assert.equal(await getWalletProofError(withSignature(undefined), vector.keyAddress, now), 'the wallet signature is missing its signature or its type');
});

test('a signature is normalised to the accepted encoding before it is stored', async () => {
  const { signature } = vector.entry.signature;
  assert.equal(normalizeWalletSignature(signature), signature);
  assert.equal(normalizeWalletSignature(toV01(signature)), signature);
  assert.equal(normalizeWalletSignature(toHighS(signature)), signature);
  assert.equal(normalizeWalletSignature(toV01(toHighS(signature))), signature);
  // upper case hex in, the same bytes out
  assert.equal(normalizeWalletSignature(`0x${signature.substring(2).toUpperCase()}`).toLowerCase(), signature);
  for (const invalid of ['0x1234', `${signature.substring(0, 130)}02`, `${signature.substring(0, 130)}1d`, 'nope']) {
    assert.equal(normalizeWalletSignature(invalid), undefined);
  }
  // every proof this client signs verifies
  for (let index = 0; index < 8; index++) {
    const account = privateKeyToAccount(generatePrivateKey());
    const normalized = normalizeWalletSignature(await account.signMessage({ message: getWalletMessageToSign(vector.keyAddress, account.address, 1790000000) }));
    assert.equal(await getWalletProofError({ ...withSignature(normalized), address: account.address }, vector.keyAddress, 1790000000), undefined);
  }
});

// Deliberately the protocol's former domain string, which the first clients signed: it is the one case that
// proves a proof over those old messages is refused. It is not a name used anywhere in the client.
test('a proof signed over the former domain string is not valid', async () => {
  const now = 1790000000;
  const account = privateKeyToAccount(vector.walletPrivateKey);
  for (const authorField of ['authorAddress', 'authorPublicKey']) {
    const message = `{"domainSeparator":"plebbit-author-wallet","${authorField}":"${vector.keyAddress}","walletAddress":"${vector.entry.address.toLowerCase()}","timestamp":${vector.entry.timestamp}}`;
    const old = withSignature(normalizeWalletSignature(await account.signMessage({ message })));
    assert.equal(await getWalletProofError(old, vector.keyAddress, now), 'the wallet did not sign for this author');
  }
});

test('a wallet proof is valid only for the author key it names', async () => {
  const now = 1790000000;
  // copied into a publication signed by another key
  assert.equal(await getWalletProofError(vector.entry, '12D3KooWScGWHZLpStnX74jENavUzXK4EBVCSRSnHes1JJBdLX5J', now), 'the wallet did not sign for this author');
  // the strings older clients signed, and the field name they used
  const account = privateKeyToAccount(vector.walletPrivateKey);
  for (const message of [
    `{"domainSeparator":"pkc-author-wallet","authorAddress":"${vector.keyAddress}","timestamp":1790000000}`,
    `{"domainSeparator":"legacy-author-wallet","authorAddress":"${vector.keyAddress}","timestamp":1790000000}`,
    `{"domainSeparator":"bitsocial-author-wallet","authorAddress":"${vector.keyAddress}","timestamp":1790000000}`,
  ]) {
    const old = withSignature(normalizeWalletSignature(await account.signMessage({ message })));
    assert.equal(await getWalletProofError(old, vector.keyAddress, now), 'the wallet did not sign for this author');
  }
  for (const address of ['example.eth', vector.entry.address.substring(2), `${vector.entry.address}00`, undefined]) {
    assert.equal(await getWalletProofError({ ...vector.entry, address }, vector.keyAddress, now), 'the wallet address is not a 0x address');
  }
  // another signature type is unproven, not wrong
  for (const type of ['sol', 'eip712']) {
    const entry = { ...vector.entry, signature: { ...vector.entry.signature, type } };
    assert.deepEqual(await verifyWalletProof(entry, vector.keyAddress, now), { outcome: 'unknown', reason: 'the wallet signature type is not eip191' });
  }
  assert.equal((await verifyWalletProof({ ...vector.entry, signature: { ...vector.entry.signature, type: undefined } }, vector.keyAddress, now)).outcome, 'invalid');
  assert.equal(await getWalletProofError(undefined, vector.keyAddress, now), 'no wallet');
  assert.equal(await getWalletProofError(vector.entry, undefined, now), 'the author has no public key');
});

test('reads the tipping/v1 options from whichever challenge publishes them', () => {
  const config = getTippingConfig(exampleCommunity);
  assert.equal(config.feeRecipient, feeRecipient);
  // the position in community.challenges, past the challenge that has no options
  assert.equal(config.challengeIndex, 1);
  assert.equal(config.tokens.length, 5);
  assert.deepEqual(config.tokens[0], { chainId: 1, type: 'native', address: undefined, minAmount: 1000000000000000n, fee: { percent: '2' } });
  assert.deepEqual(config.tokens[2].fee, { amount: 500000000000000000n });
  assert.deepEqual(config.tokens[3].fee, { amount: 1000000n, token: usdc.toLowerCase() });
  assert.equal(config.tokens[4].fee, undefined);
});

test('a community without readable tipping options has no tipping, and nothing throws', () => {
  for (const community of [
    undefined,
    {},
    { challenges: 'nope' },
    { challenges: [null, { publicOptions: null }, { publicOptions: { other: 'x' } }] },
    communityWith({ [tokensOptionName]: 'not json' }),
    communityWith({ [tokensOptionName]: '{"chainId":1}' }),
    communityWith({ [tokensOptionName]: '[]' }),
    communityWith({ [tokensOptionName]: 42 }),
  ]) {
    assert.equal(getTippingConfig(community), undefined);
  }
});

test('drops the entries it cannot read and keeps the rest', () => {
  const invalid = [
    null,
    { type: 'erc20', address: usdc },
    // a chain is named by a positive integer JSON number and nothing else
    { chainTicker: 'eth', type: 'erc20', address: usdc },
    { chainId: '1', type: 'erc20', address: usdc },
    { chainId: 0, type: 'erc20', address: usdc },
    { chainId: -1, type: 'erc20', address: usdc },
    { chainId: 1.5, type: 'erc20', address: usdc },
    { chainId: null, type: 'erc20', address: usdc },
    { chainId: 1, type: 'erc1155', address: usdc },
    { chainId: 1, type: 'erc20' },
    { chainId: 1, type: 'erc20', address: 'usdc.eth' },
    { chainId: 1, type: 'native', address: usdc },
    { chainId: 1, type: 'erc20', address: usdc, minAmount: '1.5' },
    { chainId: 1, type: 'erc20', address: usdc, minAmount: 5 },
    { chainId: 1, type: 'erc721', address: nft, minAmount: '1' },
    { chainId: 1, type: 'erc20', address: usdc, fee: {} },
    { chainId: 1, type: 'erc20', address: usdc, fee: { percent: '2', amount: '1' } },
    { chainId: 1, type: 'erc20', address: usdc, fee: { percent: '-2' } },
    { chainId: 1, type: 'erc20', address: usdc, fee: { amount: '1', token: dai } },
    { chainId: 1, type: 'erc721', address: nft, fee: { percent: '2' } },
    { chainId: 1, type: 'erc721', address: nft, fee: { amount: '1' } },
  ];
  const config = getTippingConfig(
    communityWith({
      [tokensOptionName]: JSON.stringify([...invalid, exampleTokens[1], { ...exampleTokens[1], chainId: 11155111 }]),
      [feeRecipientOptionName]: feeRecipient,
    }),
  );
  assert.deepEqual(
    config.tokens.map(({ chainId, address }) => [chainId, address]),
    [
      [1, usdc.toLowerCase()],
      [11155111, usdc.toLowerCase()],
    ],
  );
  // the same token on two chains is two tokens
  assert.notEqual(getTokenKey(config.tokens[0]), getTokenKey(config.tokens[1]));
  // a list with no readable entry is no tipping at all
  assert.equal(getTippingConfig(communityWith({ [tokensOptionName]: JSON.stringify([{ chainTicker: 'eth', type: 'native' }]) })), undefined);
  // a fee recipient that is not an address means no fee recipient, and a token with a fee can't be paid without one
  assert.equal(getTippingConfig(communityWith({ [tokensOptionName]: JSON.stringify([exampleTokens[1]]), [feeRecipientOptionName]: 'community.eth' })), undefined);
  const noFee = { chainId: 1, type: 'native' };
  const withoutRecipient = getTippingConfig(communityWith({ [tokensOptionName]: JSON.stringify([exampleTokens[1], noFee]), [feeRecipientOptionName]: 'community.eth' }));
  assert.equal(withoutRecipient.feeRecipient, undefined);
  assert.deepEqual(
    withoutRecipient.tokens.map((token) => token.type),
    ['native'],
  );
});

test('computes the fee owed on top of a tip', () => {
  const config = getTippingConfig(exampleCommunity);
  const [native, usdcToken, daiToken, nftWithFee, nftFree] = config.tokens;
  // 2% of 1 ETH, paid in the native coin
  assert.deepEqual(getRequiredFee(config, native, 10n ** 18n), { token: undefined, amount: 2n * 10n ** 16n });
  // 2.5% of 10 USDC, paid in USDC
  assert.deepEqual(getRequiredFee(config, usdcToken, 10000000n), { token: usdc.toLowerCase(), amount: 250000n });
  // rounds down, as the contract does: 2.5% of 1 base unit is 0 and owes nothing, of 41 it is 1
  assert.equal(getRequiredFee(config, usdcToken, 1n), undefined);
  assert.deepEqual(getRequiredFee(config, usdcToken, 41n), { token: usdc.toLowerCase(), amount: 1n });
  // flat, whatever the tip
  assert.deepEqual(getRequiredFee(config, daiToken, 1n), { token: dai.toLowerCase(), amount: 500000000000000000n });
  // an NFT's flat fee is paid in the ERC-20 the entry names
  assert.deepEqual(getRequiredFee(config, nftWithFee, 0n), { token: usdc.toLowerCase(), amount: 1000000n });
  assert.equal(getRequiredFee(config, nftFree, 0n), undefined);
  // no fee recipient, no fee
  assert.equal(getRequiredFee({ ...config, feeRecipient: undefined }, usdcToken, 10000000n), undefined);
  // a zero percent fee owes nothing
  assert.equal(getRequiredFee(config, { ...usdcToken, fee: { percent: '0' } }, 10000000n), undefined);
});

test('parses and formats amounts in base units', () => {
  assert.equal(parseTokenAmount('1.5', 6), 1500000n);
  assert.equal(parseTokenAmount(' 2 ', 18), 2n * 10n ** 18n);
  for (const invalid of ['', '0', '-1', '1e3', 'abc', '1.', '.5', '1.1234567']) {
    assert.equal(parseTokenAmount(invalid, 6), undefined, invalid);
  }
  assert.equal(formatTokenAmount(1500000n, 6), '1.5');
  const usdcToken = getTippingConfig(exampleCommunity).tokens[1];
  assert.equal(getTipAmountError(usdcToken, 1000000n), undefined);
  assert.equal(getTipAmountError(usdcToken, 999999n), 'below the minimum tip');
  assert.equal(getTipAmountError(usdcToken, undefined), 'invalid amount');
});

test('builds the claim a tipper publishes', () => {
  assert.deepEqual(buildTipClaim(1, txHash), { chainId: 1, txHash });
  assert.deepEqual(buildTipClaim(11155111, txHash, feeTxHash), { chainId: 11155111, txHash, feeTxHash });
  // a batched fee names the same transaction
  assert.deepEqual(buildTipClaim(1, txHash, txHash), { chainId: 1, txHash, feeTxHash: txHash });
  for (const chainId of ['eth', '1', 0, -1, 1.5, undefined]) {
    assert.throws(() => buildTipClaim(chainId, txHash));
  }
  assert.throws(() => buildTipClaim(1, '0x1234'));
  assert.throws(() => buildTipClaim(1, txHash, 'nope'));
  // the claim names its chain by id only
  assert.deepEqual(Object.keys(buildTipClaim(1, txHash, feeTxHash)), ['chainId', 'txHash', 'feeTxHash']);
  const claim = buildTipClaim(1, txHash);
  // the claim is the pre-answer of the tipping challenge: JSON text under its index, as a string key
  assert.deepEqual(getTipClaimPublishOptions(claim, 2), { challengeRequest: { challengeAnswers: { 2: JSON.stringify(claim) } } });
  assert.deepEqual(Object.keys(getTipClaimPublishOptions(claim, 0).challengeRequest.challengeAnswers), ['0']);
});

test('reads the tip a community wrote, and sums tips per token', () => {
  const from = '0x4444444444444444444444444444444444444444';
  const to = '0x5555555555555555555555555555555555555555';
  const usdcTip = (amount) => ({ chainId: 1, txHash, type: 'erc20', token: usdc, from, to, amount });
  assert.deepEqual(getTip({ tip: usdcTip('1500000') }), { chainId: 1, txHash, type: 'erc20', token: usdc, from, to, amount: 1500000n });
  assert.deepEqual(getTip({ tip: { chainId: 1, txHash, type: 'native', from, to, amount: '5' } }).amount, 5n);
  assert.equal(getTip({ tip: { chainId: 1, txHash, type: 'erc721', token: nft, from, to, tokenId: '7' } }).tokenId, '7');
  for (const invalid of [
    undefined,
    {},
    { tip: 'x' },
    { tip: usdcTip(15) },
    { tip: usdcTip('1.5') },
    { tip: { ...usdcTip('1'), type: 'erc1155' } },
    { tip: { ...usdcTip('1'), chainId: '1' } },
    { tip: { ...usdcTip('1'), chainId: 0 } },
    { tip: { ...usdcTip('1'), chainId: undefined, chainTicker: 'eth' } },
    { tip: { ...usdcTip('1'), token: undefined } },
  ]) {
    assert.equal(getTip(invalid), undefined);
  }

  assert.deepEqual(
    sumTips([
      getTip({ tip: usdcTip('1500000') }),
      getTip({ tip: usdcTip('500000') }),
      getTip({ tip: { chainId: 1, txHash, type: 'erc721', token: nft, from, to, tokenId: '7' } }),
    ]),
    [
      { chainId: 1, type: 'erc20', token: usdc, amount: 2000000n, count: 2 },
      { chainId: 1, type: 'erc721', token: nft, amount: undefined, count: 1 },
    ],
  );
  // the same token contract address on another chain is totalled apart
  assert.deepEqual(sumTips([getTip({ tip: usdcTip('1') }), getTip({ tip: { ...usdcTip('2'), chainId: 10 } })]), [
    { chainId: 1, type: 'erc20', token: usdc, amount: 1n, count: 1 },
    { chainId: 10, type: 'erc20', token: usdc, amount: 2n, count: 1 },
  ]);
  assert.deepEqual(sumTips([]), []);
});

// an author with a signing key and a wallet proven for it
const createWallet = async (publicKey, timestamp = 1700000000) => {
  const account = privateKeyToAccount(generatePrivateKey());
  const message = getWalletMessageToSign(getKeyAddressFromPublicKey(publicKey), account.address, timestamp);
  return { address: account.address, timestamp, signature: { signature: normalizeWalletSignature(await account.signMessage({ message })), type: 'eip191' } };
};
const createAuthor = async (publicKey, timestamp) => {
  const wallet = await createWallet(publicKey, timestamp);
  return { address: wallet.address, author: { wallets: { eth: wallet } }, signature: { publicKey } };
};
const tipperPublicKey = vector.publicKey;
const recipientPublicKey = '+X1OBktHFm0E1cwKLWu81Va0cAlVhj/i4snOqMz9X2k';

test('a tip is shown only when both wallet proofs verify and are its sender and receiver', async () => {
  const tipper = await createAuthor(tipperPublicKey);
  const recipient = await createAuthor(recipientPublicKey);
  const parent = { cid: 'parent', author: recipient.author, signature: recipient.signature };
  const tip = { chainId: 1, txHash, type: 'erc20', token: usdc, from: tipper.address, to: recipient.address, amount: '1500000' };
  const reply = { cid: 'reply', parentCid: 'parent', author: tipper.author, signature: tipper.signature, tip };

  assert.deepEqual(await verifyTip(reply, parent), { ...tip, amount: 1500000n });
  // addresses are compared without regard to letter case
  assert.equal((await verifyTip({ ...reply, tip: { ...tip, from: tip.from.toLowerCase(), to: tip.to.toUpperCase().replace('0X', '0x') } }, parent)).amount, 1500000n);

  const stranger = await createAuthor(tipperPublicKey);
  const withWallet = (party, wallet) => ({ ...party, author: { wallets: { eth: wallet } } });
  const failing = {
    'the tip names a sender the tipper did not publish': [{ ...reply, tip: { ...tip, from: stranger.address } }, parent],
    'the tip names a receiver the tipped author did not publish': [{ ...reply, tip: { ...tip, to: stranger.address } }, parent],
    'the tipper published no wallet': [{ ...reply, author: {} }, parent],
    'the tipped author published no wallet': [reply, { ...parent, author: { wallets: {} } }],
    // a wallet entry copied from another author: the address matches the tip, the proof names another key
    'the tipper wallet is proven for another key': [{ ...reply, signature: { publicKey: recipientPublicKey } }, parent],
    'the tipped author wallet is proven for another key': [reply, { ...parent, signature: { publicKey: tipperPublicKey } }],
    'the tipper proof has v as 0 or 1': [
      withWallet(reply, { ...tipper.author.wallets.eth, signature: { signature: toV01(tipper.author.wallets.eth.signature.signature), type: 'eip191' } }),
      parent,
    ],
    'the tipped author proof is the high s twin': [
      reply,
      withWallet(parent, { ...recipient.author.wallets.eth, signature: { signature: toHighS(recipient.author.wallets.eth.signature.signature), type: 'eip191' } }),
    ],
    'the tipped author proof is not eip191': [
      reply,
      withWallet(parent, { ...recipient.author.wallets.eth, signature: { ...recipient.author.wallets.eth.signature, type: 'sol' } }),
    ],
    'the reply is not a reply to the tipped comment': [{ ...reply, parentCid: 'other' }, parent],
    'the tipped comment is not loaded': [reply, undefined],
    'the reply has no key': [{ ...reply, signature: undefined }, parent],
    'the tip is malformed': [{ ...reply, tip: { ...tip, amount: 15 } }, parent],
  };
  for (const [label, [failingReply, failingParent]] of Object.entries(failing)) {
    assert.equal(await verifyTip(failingReply, failingParent), undefined, label);
  }
  // the ticker a wallet is published under selects nothing: any proven entry counts, on either side
  const otherTipperWallet = await createWallet(tipperPublicKey);
  const anyKey = [
    { ...reply, author: { wallets: { matic: tipper.author.wallets.eth } } },
    { ...reply, author: { wallets: { eth: otherTipperWallet, zzz: tipper.author.wallets.eth } } },
    // an entry that does not verify next to the one that does
    { ...reply, author: { wallets: { eth: recipient.author.wallets.eth, base: tipper.author.wallets.eth } } },
  ];
  for (const anyKeyReply of anyKey) {
    assert.notEqual(await verifyTip(anyKeyReply, parent), undefined);
  }
  assert.notEqual(await verifyTip(reply, { ...parent, author: { wallets: { 'some label': recipient.author.wallets.eth } } }), undefined);
  // the tip's chain id is not matched against any wallet key either
  assert.equal((await verifyTip({ ...reply, tip: { ...tip, chainId: 11155111 } }, parent)).chainId, 11155111);

  // a proof dated more than 300 seconds ahead of the reader's clock
  assert.equal(await verifyTip(reply, parent, 1700000000 - 301), undefined);
  assert.notEqual(await verifyTip(reply, parent, 1700000000 - 300), undefined);

  // the same inputs give the same promise, which is what lets a component read it during render
  assert.equal(getVerifiedTip(reply, parent), getVerifiedTip({ ...reply }, { ...parent }));
  assert.notEqual(getVerifiedTip(reply, parent), getVerifiedTip({ ...reply, tip: { ...tip, amount: '2' } }, parent));
  assert.deepEqual(await getVerifiedTip(reply, parent), { ...tip, amount: 1500000n });
  assert.equal(await getVerifiedTip({ cid: 'reply', parentCid: 'parent' }, parent), undefined);
});

test('the total of a comment leaves out the tips that do not verify', async () => {
  const tipper = await createAuthor(tipperPublicKey);
  const recipient = await createAuthor(recipientPublicKey);
  const stranger = await createAuthor(tipperPublicKey);
  const parent = { cid: 'parent', author: recipient.author, signature: recipient.signature };
  const usdcTip = (amount, from = tipper.address) => ({ chainId: 1, txHash, type: 'erc20', token: usdc, from, to: recipient.address, amount });
  const reply = (cid, tip, parentCid = 'parent') => ({ cid, parentCid, author: tipper.author, signature: tipper.signature, tip });
  const replies = [
    reply('a', usdcTip('1500000')),
    reply('b', usdcTip('500000')),
    reply('c', { chainId: 1, txHash, type: 'erc721', token: nft, from: tipper.address, to: recipient.address, tokenId: '7' }),
    // a tip whose sender is not the tipper's proven wallet
    reply('d', usdcTip('9000000', stranger.address)),
    // a tipper whose wallet entry was copied from someone else
    { ...reply('e', usdcTip('9000000', stranger.address)), author: stranger.author, signature: { publicKey: recipientPublicKey } },
    { cid: 'f', parentCid: 'parent', content: 'no tip' },
    reply('g', { broken: true }),
    // a tip on a nested reply, as a flat sort lists it
    reply('h', usdcTip('9000000'), 'other'),
    undefined,
  ];
  assert.deepEqual(
    getTipReplies(parent, replies).map(({ cid }) => cid),
    ['a', 'b', 'c', 'd', 'e'],
  );
  assert.deepEqual(await getVerifiedTipTotals(parent, replies), [
    { chainId: 1, type: 'erc20', token: usdc, amount: 2000000n, count: 2 },
    { chainId: 1, type: 'erc721', token: nft, amount: undefined, count: 1 },
  ]);
  assert.equal(getVerifiedTipTotals(parent, replies), getVerifiedTipTotals(parent, [...replies]));
  // the list checks each reply on its own and says which part failed: a, b, c verify, d and e do not
  const checks = await Promise.all(getTipReplies(parent, replies).map((tipReply) => getTipCheck(tipReply, parent)));
  assert.deepEqual(
    checks.map((check) => check && getTipCheckError(check)),
    [undefined, undefined, undefined, 'the sender is not a wallet the tipper proved', 'the sender is not a wallet the tipper proved'],
  );
  assert.deepEqual(checks[3], { tip: getTip(replies[3]), isReplyToParent: true, senderProven: false, receiverProven: true });
  assert.equal(getTipCheck(replies[0], parent), getTipCheck({ ...replies[0] }, { ...parent }));
  // no tip to check, or the tipped comment is not loaded
  assert.equal(await getTipCheck(replies[5], parent), undefined);
  assert.equal(getTipCheckError(await checkTip(replies[0], undefined)), 'the tipped comment is not loaded, or this is not a reply to it');
  assert.equal(
    getTipCheckError(await checkTip(replies[0], { ...parent, signature: { publicKey: tipperPublicKey } })),
    'the receiver is not a wallet the tipped author proved',
  );
  assert.deepEqual(await getVerifiedTipTotals(undefined, replies), []);
  assert.deepEqual(await getVerifiedTipTotals(parent, undefined), []);
  assert.deepEqual(await getVerifiedTipTotals(parent, [replies[5]]), []);
  // the tipped comment's own wallet no longer proven: nothing counts
  assert.deepEqual(await getVerifiedTipTotals({ ...parent, signature: { publicKey: tipperPublicKey } }, replies), []);
});

test('a tip is sent to the eth entry if it verifies, otherwise to the first proven entry by key', async () => {
  const publicKey = recipientPublicKey;
  const [eth, arb, base, matic] = await Promise.all([createWallet(publicKey), createWallet(publicKey), createWallet(publicKey), createWallet(publicKey)]);
  // proven for another author's key, so not a proof of this author
  const copied = await createWallet(tipperPublicKey);
  const party = (wallets) => ({ cid: 'comment', author: { wallets }, signature: { publicKey } });

  assert.equal(await getTipRecipientAddress(party({ matic, eth, arb })), eth.address);
  // no eth entry: the first by key, whatever order the object lists them in
  assert.equal(await getTipRecipientAddress(party({ matic, base, arb })), arb.address);
  // an eth entry that does not verify is passed over, and so is every other one that does not
  assert.equal(await getTipRecipientAddress(party({ eth: copied, arb: copied, matic, base })), base.address);
  assert.equal(await getTipRecipientAddress(party({ eth: { ...eth, address: 'someone.eth' }, matic })), matic.address);
  // keys sort by code unit, so upper case comes before lower case
  assert.equal(await getTipRecipientAddress(party({ matic, Zeta: arb })), arb.address);
  // an address the tipper has proven too is not a recipient: the eth entry is skipped, then the first other
  assert.equal(await getTipRecipientAddress(party({ matic, eth, arb }), undefined, [eth.address.toLowerCase()]), arb.address);
  assert.equal(await getTipRecipientAddress(party({ matic, eth }), undefined, [eth.address, matic.address]), undefined);
  for (const wallets of [undefined, {}, { eth: copied }, { eth: 'nope', matic: null }]) {
    assert.equal(await getTipRecipientAddress(party(wallets)), undefined);
  }
  assert.equal(await getTipRecipientAddress(undefined), undefined);
  // no key to verify against
  assert.equal(await getTipRecipientAddress({ author: { wallets: { eth } } }), undefined);

  assert.deepEqual(await getProvenWalletAddresses(party({ matic, eth: copied, base, arb })), [arb.address, base.address, matic.address]);
  assert.deepEqual(await getProvenWalletAddresses(party({ eth })), [eth.address]);
  assert.deepEqual(await getProvenWalletAddresses(party(undefined)), []);
  // dated more than 300 seconds ahead of the clock: not proven yet
  assert.deepEqual(await getProvenWalletAddresses(party({ eth }), 1700000000 - 301), []);
});

// a JSON-RPC endpoint that reports one chain id, fails every other call, and records what it was asked
const startRpc = async (chainId) => {
  const methods = [];
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      const { id, method } = JSON.parse(body);
      methods.push(method);
      const result = method === 'eth_chainId' ? { result: `0x${chainId.toString(16)}` } : { error: { code: -32601, message: 'not available in this test' } };
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ jsonrpc: '2.0', id, ...result }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, methods, close: () => new Promise((resolve) => server.close(resolve)) };
};

test('nothing is sent through an RPC that reports another chain id than the token names', async () => {
  const sepolia = await startRpc(11155111);
  try {
    await ensureRpcChainId(sepolia.url, 11155111);
    await assert.rejects(ensureRpcChainId(sepolia.url, 1), /reports chain id 11155111\. Nothing was sent/);

    const privateKey = `0x${'02'.repeat(32)}`;
    const to = '0x5555555555555555555555555555555555555555';
    const parentBinding = getParentBindingSuffix('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
    for (const token of [
      { chainId: 1, type: 'native' },
      { chainId: 1, type: 'erc20', address: usdc },
      { chainId: 1, type: 'erc721', address: nft },
    ]) {
      sepolia.methods.length = 0;
      await assert.rejects(signTransfer({ rpcUrl: sepolia.url, privateKey, token, to, amountOrTokenId: 1n, parentBinding, nonce: 0 }), /reports chain id 11155111/);
      // refused on the chain id alone: no nonce, gas or send was asked for
      assert.deepEqual(sepolia.methods, ['eth_chainId']);
    }

    // on the right chain the transfer goes on to the RPC, which this test endpoint then fails
    sepolia.methods.length = 0;
    await assert.rejects(
      signTransfer({ rpcUrl: sepolia.url, privateKey, token: { chainId: 11155111, type: 'native' }, to, amountOrTokenId: 1n, parentBinding, nonce: 0 }),
      (error) => !/reports chain id/.test(error.message),
    );
    assert.ok(sepolia.methods.length > 1);
    assert.ok(!sepolia.methods.includes('eth_sendRawTransaction'));
  } finally {
    await sepolia.close();
  }
});

test('reads the fee a tip carries, and checks it against the community config', () => {
  const config = getTippingConfig(exampleCommunity);
  const from = '0x4444444444444444444444444444444444444444';
  const to = '0x5555555555555555555555555555555555555555';
  const fee = { txHash: feeTxHash, to: feeRecipient, amount: '250000', token: usdc };
  const base = { chainId: 1, txHash, type: 'erc20', token: usdc, from, to, amount: '10000000' };
  const tip = getTip({ tip: { ...base, fee } });
  assert.deepEqual(tip.fee, { txHash: feeTxHash, to: feeRecipient, amount: 250000n, token: usdc });
  assert.equal(getTipFeeConfigError(config, tip), undefined);
  // a fee that does not parse drops the whole tip
  assert.equal(getTip({ tip: { ...base, fee: { ...fee, amount: 'x' } } }), undefined);
  assert.equal(getTipFeeConfigError(config, getTip({ tip: base })), 'the community requires a fee and the tip has none');
  assert.equal(getTipFeeConfigError(config, getTip({ tip: { ...base, fee: { ...fee, to: from } } })), 'the fee did not go to the community fee recipient');
  assert.equal(getTipFeeConfigError(config, getTip({ tip: { ...base, fee: { ...fee, token: dai } } })), 'the fee was paid in another token than the community asks');
  assert.equal(getTipFeeConfigError(config, getTip({ tip: { ...base, fee: { ...fee, amount: '249999' } } })), 'the fee is below what the community asks');
  // a token without a fee owes none
  assert.equal(
    getTipFeeConfigError(config, getTip({ tip: { chainId: 1, txHash, type: 'erc721', token: '0x3333333333333333333333333333333333333333', from, to, tokenId: '1' } })),
    undefined,
  );
  assert.equal(getTipFeeConfigError(config, getTip({ tip: { ...base, token: '0x6666666666666666666666666666666666666666' } })), 'the community does not list this token');
});

test('every case of the BSIP-22 test vectors comes out as the BSIP says', async () => {
  assert.equal(vectors.cases.length, 26);
  for (const vectorCase of vectors.cases) {
    const key = vectorCase.authorKey === 'other' ? vectors.otherKey.address : vectors.authorKey.address;
    const { outcome } = await verifyWalletProof(vectorCase.entry, key, vectorCase.verifierTime);
    assert.equal(outcome, vectorCase.outcome, vectorCase.name);
  }
});

test('the parent binding is the 65 byte suffix of the contract', () => {
  const parentCid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
  const suffix = '0xa1616da16762736f2d74697058209e70d347eb27e5edfa2b03409b020ecdaba0997a7a4806a5c441694ea6bf9b5d002e0280218021802180218021802180218021';
  assert.equal(getParentBindingSuffix(parentCid), suffix);
  assert.equal((suffix.length - 2) / 2, 65);
  // hashed as written
  assert.notEqual(getParentBindingSuffix(parentCid.toLowerCase()), suffix);
  assert.equal(hasParentBinding(suffix, parentCid), true);
  assert.equal(hasParentBinding(`0xa9059cbb${suffix.substring(2)}`, parentCid), true);
  // nothing may follow it, and it names one parent
  assert.equal(hasParentBinding(`${suffix}00`, parentCid), false);
  assert.equal(hasParentBinding('0x', parentCid), false);
  assert.equal(hasParentBinding(suffix, 'QmbWqxBEKC3P8tqsKc98xmWNzrzDtRLMiMPL8wBuTGsMnR'), false);
});

test('a tip verified under another contract is not read, and fees are limited to four decimals', () => {
  const tip = { chainId: 1, txHash, type: 'native', from: feeRecipient, to: feeRecipient, amount: '1' };
  assert.equal(getTip({ tip: { ...tip, contract: 'tipping/v1' } }).chainId, 1);
  assert.equal(getTip({ tip }).chainId, 1);
  assert.equal(getTip({ tip: { ...tip, contract: 'tipping/v2' } }), undefined);
  const tokens = (fee) =>
    getTippingConfig(communityWith({ [tokensOptionName]: JSON.stringify([{ chainId: 1, type: 'native', fee }]), [feeRecipientOptionName]: feeRecipient }));
  assert.equal(tokens({ percent: '2.5001' }).tokens.length, 1);
  for (const percent of ['2.50001', '0', '101', '-1']) {
    assert.equal(tokens({ percent }), undefined);
  }
});

test('a pending tip sends the fee first and the tip right behind it, and only what was not sent', () => {
  const fee = { amount: '20000000000000', to: feeRecipient };
  const hash = (digit) => `0x${digit.repeat(64)}`;
  // fresh: both go out back to back
  assert.deepEqual(getTipSendPlan({ fee }), { sendFee: true, sendTip: true });
  // no fee owed: only the tip
  assert.deepEqual(getTipSendPlan({}), { sendFee: false, sendTip: true });
  // resumed after a reload with only the fee sent: the tip goes now, the fee is not paid twice
  assert.deepEqual(getTipSendPlan({ fee, feeTxHash: hash('a') }), { sendFee: false, sendTip: true });
  // both sent but not mined: nothing is sent, the resume only waits
  assert.deepEqual(getTipSendPlan({ fee, feeTxHash: hash('a'), txHash: hash('b') }), { sendFee: false, sendTip: false });
  // the tip sent but its fee not (the fee send failed after the tip, or was replaced): the fee is sent
  assert.deepEqual(getTipSendPlan({ fee, txHash: hash('b') }), { sendFee: true, sendTip: false });
});

test('the two transactions are judged together once both are waited for', () => {
  const ok = { ok: true };
  const reverted = { ok: false, error: 'transaction 0xaa reverted' };
  assert.deepEqual(getTipSettleOutcome(ok, ok), { type: 'mined' });
  assert.deepEqual(getTipSettleOutcome(ok), { type: 'mined' });
  // the fee failed after the tip went out: the tip stands and the fee can be sent again
  assert.deepEqual(getTipSettleOutcome(ok, reverted), { type: 'fee-failed', error: reverted.error });
  // a failed tip leaves nothing to claim, whatever happened to the fee
  assert.deepEqual(getTipSettleOutcome(reverted, ok), { type: 'tip-failed', error: reverted.error });
  assert.deepEqual(getTipSettleOutcome(reverted, reverted), { type: 'tip-failed', error: reverted.error });
  assert.deepEqual(getTipSettleOutcome(reverted), { type: 'tip-failed', error: reverted.error });
});

// an RPC that serves what signing a transfer reads, and keeps the raw transactions it is sent
const fail = (error) => {
  throw error;
};

const startChain = async ({ known = [], sendError, latestNonce = 0, callError, lookupError } = {}) => {
  const sent = [];
  const handlers = {
    eth_chainId: () => '0xaa36a7',
    eth_getBlockByNumber: () => ({
      number: '0x10',
      hash: `0x${'11'.repeat(32)}`,
      parentHash: `0x${'22'.repeat(32)}`,
      timestamp: '0x1',
      baseFeePerGas: '0x3b9aca00',
      gasLimit: '0x1c9c380',
      gasUsed: '0x0',
      transactions: [],
      uncles: [],
      difficulty: '0x0',
      nonce: '0x0000000000000000',
      miner: `0x${'00'.repeat(20)}`,
    }),
    eth_maxPriorityFeePerGas: () => '0x3b9aca00',
    eth_gasPrice: () => '0x77359400',
    eth_estimateGas: () => '0x6000',
    // every contract read answers with the number 6, which is a valid decimals() and not a valid symbol()
    eth_call: () => {
      if (callError) {
        throw callError;
      }
      return `0x${'0'.repeat(63)}6`;
    },
    eth_getTransactionCount: ({ params }) => (params[1] === 'latest' ? `0x${latestNonce.toString(16)}` : '0x0'),
    eth_getTransactionByHash: ({ params }) => (lookupError ? fail(lookupError) : known.includes(params[0]) ? { hash: params[0], blockNumber: null } : null),
    eth_sendRawTransaction: ({ params }) => {
      sent.push(params[0]);
      if (sendError) {
        throw sendError;
      }
      return `0x${'ab'.repeat(32)}`;
    },
  };
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      const call = JSON.parse(body);
      let result;
      try {
        result = handlers[call.method]
          ? { result: handlers[call.method](call) }
          : { error: { code: -32601, message: `the method ${call.method} does not exist/is not available` } };
      } catch (error) {
        result = { error: { code: -32000, message: error.message } };
      }
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ jsonrpc: '2.0', id: call.id, ...result }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, sent, close: () => new Promise((resolve) => server.close(resolve)) };
};

test('a transfer is signed with a known hash, before anything is broadcast, and with the fees it is priced at', async () => {
  const chain = await startChain();
  try {
    const privateKey = `0x${'02'.repeat(32)}`;
    const to = '0x5555555555555555555555555555555555555555';
    const parentBinding = getParentBindingSuffix('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
    const options = { rpcUrl: chain.url, privateKey, token: { chainId: 11155111, type: 'native' }, to, amountOrTokenId: 5n, parentBinding };
    const fee = await signTransfer({ ...options, nonce: 7 });
    const tip = await signTransfer({ ...options, nonce: 8 });
    // signing sends nothing: the hash is the record of what may be in the mempool
    assert.deepEqual(chain.sent, []);
    assert.equal(fee.hash, keccak256(fee.raw));
    assert.notEqual(fee.hash, tip.hash);
    const parsed = parseTransaction(fee.raw);
    assert.equal(parsed.nonce, 7);
    assert.equal(parsed.chainId, 11155111);
    assert.equal(parsed.to.toLowerCase(), to);
    assert.equal(parsed.value, 5n);
    assert.equal(parsed.data, parentBinding);
    // the send is priced as the simulation counted it, which is the fee cap and not the gas price
    const { gas, gasPrice } = await simulateTransfer(options);
    assert.equal(gas, 0x6000n);
    assert.equal(parsed.maxFeePerGas, gasPrice);
    assert.equal(parseTransaction(tip.raw).nonce, 8);
  } finally {
    await chain.close();
  }
});

test('a saved transfer is broadcast again only when the RPC does not know it', async () => {
  const hash = `0x${'cd'.repeat(32)}`;
  const raw = '0x02';
  // not known: sent
  const fresh = await startChain();
  try {
    await ensureBroadcast(fresh.url, { hash, raw });
    assert.deepEqual(fresh.sent, [raw]);
  } finally {
    await fresh.close();
  }
  // known, pending or mined: nothing is sent, so a resume never signs or sends a second one
  const known = await startChain({ known: [hash] });
  try {
    await ensureBroadcast(known.url, { hash, raw });
    assert.deepEqual(known.sent, []);
  } finally {
    await known.close();
  }
  // another node of the RPC already has it: that is not a failure
  const raced = await startChain({ sendError: Error('already known') });
  try {
    await ensureBroadcast(raced.url, { hash, raw });
    assert.equal(raced.sent.length, 1);
  } finally {
    await raced.close();
  }
  // the RPC's error is passed on as it is: it does not say whether the transaction was taken
  const refused = await startChain({ sendError: Error('nonce too low') });
  try {
    await assert.rejects(ensureBroadcast(refused.url, { hash, raw }), /nonce too low/);
  } finally {
    await refused.close();
  }
  // no answer at all
  const gone = await startChain();
  const goneUrl = gone.url;
  await gone.close();
  await assert.rejects(ensureBroadcast(goneUrl, { hash, raw }));
});

test('a signed transfer is dead only when another transaction used its nonce and it is not found', async () => {
  const options = (rpcUrl) => ({
    rpcUrl,
    privateKey: `0x${'02'.repeat(32)}`,
    token: { chainId: 11155111, type: 'native' },
    to: '0x5555555555555555555555555555555555555555',
    amountOrTokenId: 1n,
    parentBinding: getParentBindingSuffix('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'),
  });
  const from = privateKeyToAccount(`0x${'02'.repeat(32)}`).address;
  const probe = await startChain();
  const signed = await signTransfer({ ...options(probe.url), nonce: 5 });
  await probe.close();
  // the nonce is still free: the transaction may yet be sent, whatever the RPC said
  const free = await startChain({ latestNonce: 5 });
  try {
    assert.equal(await isTransferDead(free.url, signed, from, 0), false);
  } finally {
    await free.close();
  }
  // the nonce is used and the transaction is not found, even after looking again: it can never be mined
  const used = await startChain({ latestNonce: 6 });
  try {
    assert.equal(await isTransferDead(used.url, signed, from, 0), true);
  } finally {
    await used.close();
  }
  // the nonce is used by this very transaction, which the RPC knows: not dead
  const mined = await startChain({ latestNonce: 6, known: [signed.hash] });
  try {
    assert.equal(await isTransferDead(mined.url, signed, from, 0), false);
  } finally {
    await mined.close();
  }
});

test('a proven address in any letter case is paid, also when its checksum would be wrong', async () => {
  const chain = await startChain();
  try {
    const mixedCase = '0x5050A4F4B3f9338C3472dcC01A87C76A144b3c9c';
    const signed = await signTransfer({
      rpcUrl: chain.url,
      privateKey: `0x${'02'.repeat(32)}`,
      token: { chainId: 11155111, type: 'erc20', address: usdc.toLowerCase() },
      to: mixedCase,
      amountOrTokenId: 1n,
      parentBinding: getParentBindingSuffix('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'),
      nonce: 0,
    });
    assert.ok(parseTransaction(signed.raw).data.toLowerCase().includes(mixedCase.substring(2).toLowerCase()));
  } finally {
    await chain.close();
  }
});

test('the nonce of a saved transaction is read back from it', async () => {
  const chain = await startChain();
  try {
    const options = {
      rpcUrl: chain.url,
      privateKey: `0x${'02'.repeat(32)}`,
      token: { chainId: 11155111, type: 'native' },
      to: '0x5555555555555555555555555555555555555555',
      amountOrTokenId: 1n,
      parentBinding: getParentBindingSuffix('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'),
    };
    for (const nonce of [0, 1, 30, 31]) {
      assert.equal(getSignedNonce((await signTransfer({ ...options, nonce })).raw), nonce);
    }
  } finally {
    await chain.close();
  }
});

test('token info: a failed read shows the address without decimals and is read again later, not cached as "no decimals"', async () => {
  const token = { chainId: 11155111, type: 'erc20', address: usdc.toLowerCase() };
  const down = await startChain({ callError: Error('execution reverted') });
  const first = getTokenInfo(down.url, token);
  // the same promise while it is remembered, so React's use() settles on it
  assert.equal(getTokenInfo(down.url, token), first);
  assert.equal((await first).decimals, undefined);
  assert.equal(getTokenInfo(down.url, token), first);
  await down.close();
  // a working node on the right chain gives the decimals
  const up = await startChain();
  assert.equal((await getTokenInfo(up.url, token)).decimals, 6);
  await up.close();
  // decimals from a node on another chain are never read
  const wrong = await startChain();
  assert.equal((await getTokenInfo(wrong.url, { ...token, chainId: 1 })).decimals, undefined);
  await wrong.close();
});

test('token addresses are read in lower case, so one with a wrong checksum still works in chain calls', () => {
  const badChecksum = '0xA0b86991c6218b36c1d19D4a5e9eB0cE3606eB49'.replace(/E3606eB49$/, 'e3606EB48');
  const config = getTippingConfig(communityWith({ [tokensOptionName]: JSON.stringify([{ chainId: 1, type: 'erc20', address: badChecksum }]) }));
  assert.equal(config.tokens[0].address, badChecksum.toLowerCase());
});

test('an RPC error on the lookup is not an answer that the transaction is unknown', async () => {
  const chain = await startChain({ lookupError: Error('rate limited') });
  const parentBinding = getParentBindingSuffix('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
  const signed = await signTransfer({
    rpcUrl: chain.url,
    privateKey: `0x${'02'.repeat(32)}`,
    token: { chainId: 11155111, type: 'native' },
    to: '0x5555555555555555555555555555555555555555',
    amountOrTokenId: 5n,
    parentBinding,
    nonce: 0,
  });
  await assert.rejects(ensureBroadcast(chain.url, signed), /rate limited|Unknown|HTTP|error/i);
  // nothing was sent on a lookup that could not answer
  assert.deepEqual(chain.sent, []);
  await chain.close();
});
