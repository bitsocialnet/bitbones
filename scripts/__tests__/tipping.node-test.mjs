// Node strips the types from src/lib/tipping.ts on import, which is why that file has no relative imports.
import assert from 'node:assert/strict';
import { test } from 'node:test';
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
  getTipTotals,
  getWalletMessageToSign,
  getWalletProofError,
  parseTokenAmount,
  tokensOptionName,
} from '../../src/lib/tipping.ts';

const usdc = '0xA0b86991c6218b36c1d19D4a5e9eB0cE3606eB48';
const dai = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const nft = '0x2222222222222222222222222222222222222222';
const feeRecipient = '0x1111111111111111111111111111111111111111';
const txHash = `0x${'a'.repeat(64)}`;
const feeTxHash = `0x${'b'.repeat(64)}`;

const exampleTokens = [
  { chainTicker: 'eth', type: 'native', minAmount: '1000000000000000', fee: { percent: '2' } },
  { chainTicker: 'eth', type: 'erc20', address: usdc, minAmount: '1000000', fee: { percent: '2.5' } },
  { chainTicker: 'eth', type: 'erc20', address: dai, fee: { amount: '500000000000000000' } },
  { chainTicker: 'eth', type: 'erc721', address: nft, fee: { amount: '1000000', token: usdc } },
  { chainTicker: 'eth', type: 'erc721', address: '0x3333333333333333333333333333333333333333' },
];

const communityWith = (publicOptions) => ({ challenges: [{ type: 'text/plain' }, { type: 'text/plain', publicOptions }] });
const exampleCommunity = communityWith({ [tokensOptionName]: JSON.stringify(exampleTokens), [feeRecipientOptionName]: feeRecipient });

test('the wallet message is the exact agreed string', () => {
  assert.equal(
    getWalletMessageToSign('12D3KooWScGWHZLpStnX74jENavUzXK4EBVCSRSnHes1JJBdLX5J', 1770000000),
    '{"domainSeparator":"bitsocial-author-wallet","authorPublicKey":"12D3KooWScGWHZLpStnX74jENavUzXK4EBVCSRSnHes1JJBdLX5J","timestamp":1770000000}',
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

test('a wallet proof is valid only for the author key it names', async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const author = '12D3KooWScGWHZLpStnX74jENavUzXK4EBVCSRSnHes1JJBdLX5J';
  const timestamp = 1770000000;
  const sign = async (message) => ({ address: account.address, timestamp, signature: { signature: await account.signMessage({ message }), type: 'eip191' } });
  const wallet = await sign(getWalletMessageToSign(author, timestamp));
  const now = timestamp + 10;

  assert.equal(await getWalletProofError(wallet, author, now), undefined);
  // copied into another author's profile
  assert.equal(await getWalletProofError(wallet, '12D3KooWAnotherAuthor', now), 'the wallet did not sign for this author');
  // the strings older clients signed
  for (const separator of ['pkc-author-wallet', 'plebbit-author-wallet']) {
    const old = await sign(`{"domainSeparator":"${separator}","authorAddress":"${author}","timestamp":${timestamp}}`);
    assert.equal(await getWalletProofError(old, author, now), 'the wallet did not sign for this author');
  }
  assert.equal(await getWalletProofError(wallet, author, timestamp - 1), 'the wallet timestamp is in the future');
  assert.equal(await getWalletProofError({ ...wallet, address: 'someone.eth' }, author, now), 'the wallet address is not a 0x address');
  assert.equal(await getWalletProofError({ ...wallet, signature: { ...wallet.signature, type: 'sol' } }, author, now), 'the wallet signature type is not eip191');
  assert.equal(await getWalletProofError({ ...wallet, signature: { ...wallet.signature, signature: '0x1234' } }, author, now), 'the wallet signature is malformed');
  assert.equal(await getWalletProofError(undefined, author, now), 'no wallet');
  assert.equal(await getWalletProofError(wallet, undefined, now), 'the author has no public key');
});

test('reads the tipping/v1 options from whichever challenge publishes them', () => {
  const config = getTippingConfig(exampleCommunity);
  assert.equal(config.feeRecipient, feeRecipient);
  assert.equal(config.tokens.length, 5);
  assert.deepEqual(config.tokens[0], { chainTicker: 'eth', type: 'native', address: undefined, minAmount: 1000000000000000n, fee: { percent: '2' } });
  assert.deepEqual(config.tokens[2].fee, { amount: 500000000000000000n });
  assert.deepEqual(config.tokens[3].fee, { amount: 1000000n, token: usdc });
  assert.equal(config.tokens[4].fee, undefined);
});

test('a community without readable tipping options has no tipping, and nothing throws', () => {
  for (const community of [
    undefined,
    {},
    { challenges: 'nope' },
    { challenges: [null, { publicOptions: null }, { publicOptions: { other: 'x' } }] },
    communityWith({ [tokensOptionName]: 'not json' }),
    communityWith({ [tokensOptionName]: '{"chainTicker":"eth"}' }),
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
    { chainTicker: 'eth', type: 'erc1155', address: usdc },
    { chainTicker: 'eth', type: 'erc20' },
    { chainTicker: 'eth', type: 'erc20', address: 'usdc.eth' },
    { chainTicker: 'eth', type: 'native', address: usdc },
    { chainTicker: 'eth', type: 'erc20', address: usdc, minAmount: '1.5' },
    { chainTicker: 'eth', type: 'erc20', address: usdc, minAmount: 5 },
    { chainTicker: 'eth', type: 'erc721', address: nft, minAmount: '1' },
    { chainTicker: 'eth', type: 'erc20', address: usdc, fee: {} },
    { chainTicker: 'eth', type: 'erc20', address: usdc, fee: { percent: '2', amount: '1' } },
    { chainTicker: 'eth', type: 'erc20', address: usdc, fee: { percent: '-2' } },
    { chainTicker: 'eth', type: 'erc20', address: usdc, fee: { amount: '1', token: dai } },
    { chainTicker: 'eth', type: 'erc721', address: nft, fee: { percent: '2' } },
    { chainTicker: 'eth', type: 'erc721', address: nft, fee: { amount: '1' } },
  ];
  const config = getTippingConfig(communityWith({ [tokensOptionName]: JSON.stringify([...invalid, exampleTokens[1]]) }));
  assert.equal(config.tokens.length, 1);
  assert.equal(config.tokens[0].address, usdc);
  // a fee recipient that is not an address means no fee recipient
  assert.equal(
    getTippingConfig(communityWith({ [tokensOptionName]: JSON.stringify([exampleTokens[1]]), [feeRecipientOptionName]: 'community.eth' })).feeRecipient,
    undefined,
  );
});

test('computes the fee owed on top of a tip', () => {
  const config = getTippingConfig(exampleCommunity);
  const [native, usdcToken, daiToken, nftWithFee, nftFree] = config.tokens;
  // 2% of 1 ETH, paid in the native coin
  assert.deepEqual(getRequiredFee(config, native, 10n ** 18n), { token: undefined, amount: 2n * 10n ** 16n });
  // 2.5% of 10 USDC, paid in USDC
  assert.deepEqual(getRequiredFee(config, usdcToken, 10000000n), { token: usdc, amount: 250000n });
  // rounds up: 2.5% of 1 base unit is 1
  assert.deepEqual(getRequiredFee(config, usdcToken, 1n), { token: usdc, amount: 1n });
  assert.deepEqual(getRequiredFee(config, usdcToken, 41n), { token: usdc, amount: 2n });
  // flat, whatever the tip
  assert.deepEqual(getRequiredFee(config, daiToken, 1n), { token: dai, amount: 500000000000000000n });
  // an NFT's flat fee is paid in the ERC-20 the entry names
  assert.deepEqual(getRequiredFee(config, nftWithFee, 0n), { token: usdc, amount: 1000000n });
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
  assert.deepEqual(buildTipClaim('eth', txHash), { chainTicker: 'eth', txHash });
  assert.deepEqual(buildTipClaim('eth', txHash, feeTxHash), { chainTicker: 'eth', txHash, feeTxHash });
  // a batched fee names the same transaction
  assert.deepEqual(buildTipClaim('eth', txHash, txHash), { chainTicker: 'eth', txHash, feeTxHash: txHash });
  assert.throws(() => buildTipClaim('', txHash));
  assert.throws(() => buildTipClaim('eth', '0x1234'));
  assert.throws(() => buildTipClaim('eth', txHash, 'nope'));
  const claim = buildTipClaim('eth', txHash);
  assert.deepEqual(getTipClaimPublishOptions(claim, 'author'), { author: { tip: claim } });
  assert.deepEqual(getTipClaimPublishOptions(claim, 'comment'), { tip: claim });
});

test('reads the verified tip a community wrote, and sums the tips on a comment', () => {
  const from = '0x4444444444444444444444444444444444444444';
  const to = '0x5555555555555555555555555555555555555555';
  const usdcTip = (amount) => ({ chainTicker: 'eth', txHash, type: 'erc20', token: usdc, from, to, amount });
  assert.deepEqual(getTip({ tip: usdcTip('1500000') }), { chainTicker: 'eth', txHash, type: 'erc20', token: usdc, from, to, amount: 1500000n });
  assert.deepEqual(getTip({ tip: { chainTicker: 'eth', txHash, type: 'native', from, to, amount: '5' } }).amount, 5n);
  assert.equal(getTip({ tip: { chainTicker: 'eth', txHash, type: 'erc721', token: nft, from, to, tokenId: '7' } }).tokenId, '7');
  for (const invalid of [
    undefined,
    {},
    { tip: 'x' },
    { tip: usdcTip(15) },
    { tip: usdcTip('1.5') },
    { tip: { ...usdcTip('1'), type: 'erc1155' } },
    { tip: { ...usdcTip('1'), token: undefined } },
  ]) {
    assert.equal(getTip(invalid), undefined);
  }

  const replies = [
    { parentCid: 'parent', tip: usdcTip('1500000') },
    { parentCid: 'parent', tip: usdcTip('500000') },
    { parentCid: 'parent', tip: { chainTicker: 'eth', txHash, type: 'erc721', token: nft, from, to, tokenId: '7' } },
    { parentCid: 'parent', content: 'no tip' },
    { parentCid: 'parent', tip: { broken: true } },
    // a tip on a nested reply, as a flat sort lists it
    { parentCid: 'other', tip: usdcTip('9000000') },
    undefined,
  ];
  assert.deepEqual(getTipTotals('parent', replies), [
    { chainTicker: 'eth', type: 'erc20', token: usdc, amount: 2000000n, count: 2 },
    { chainTicker: 'eth', type: 'erc721', token: nft, amount: undefined, count: 1 },
  ]);
  assert.deepEqual(getTipTotals(undefined, replies), []);
  assert.deepEqual(getTipTotals('parent', undefined), []);
});
