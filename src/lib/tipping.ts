// Pure logic for the tipping/v1 contract and the author wallet proof. No React, no network, and no
// relative imports, so scripts/__tests__/tipping.node-test.mjs can import this file directly.
import { formatUnits, isAddress, isHash, parseUnits, recoverMessageAddress } from 'viem';
import type { Address, Hash, Hex } from 'viem';

// ---------------------------------------------------------------------------------------------
// author wallet proof
// ---------------------------------------------------------------------------------------------

// The exact string a wallet signs to link itself to an author. Built by hand because the field
// order and the absence of whitespace are part of the format. authorPublicKey is the key address
// of the author's signing key (12D3KooW...), never the runtime author.address, which is the
// author's name when they have one and follows the name when it is repointed.
export const getWalletMessageToSign = (authorPublicKey: string, timestamp: number): string =>
  `{"domainSeparator":"bitsocial-author-wallet","authorPublicKey":"${authorPublicKey}","timestamp":${timestamp}}`;

export const walletSignatureType = 'eip191';

const base58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const base58Encode = (bytes: Uint8Array): string => {
  let value = 0n;
  for (const byte of bytes) {
    value = value * 256n + BigInt(byte);
  }
  let encoded = '';
  while (value > 0n) {
    encoded = base58Alphabet[Number(value % 58n)] + encoded;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) {
      break;
    }
    encoded = `1${encoded}`;
  }
  return encoded;
};

const base64ToBytes = (base64: string): Uint8Array => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

// The key address of an ed25519 public key, as signature.publicKey carries it (base64, 32 bytes):
// the libp2p PeerId, an identity multihash of the protobuf-encoded key, in base58.
export const getKeyAddressFromPublicKey = (publicKeyBase64: string): string | undefined => {
  let publicKey: Uint8Array;
  try {
    publicKey = base64ToBytes(publicKeyBase64);
  } catch {
    return undefined;
  }
  if (publicKey.length !== 32) {
    return undefined;
  }
  // 0x00 identity multihash, 0x24 length, then protobuf { type: ed25519 (0x08 0x01), data (0x12 0x20) }
  return base58Encode(Uint8Array.from([0x00, 0x24, 0x08, 0x01, 0x12, 0x20, ...publicKey]));
};

// The in-app wallet is the account's own signing key reused as a secp256k1 key, which is how the
// hooks library derives the wallet it attaches to every new account.
export const getEthPrivateKeyFromSignerPrivateKey = (privateKeyBase64: string): Hex | undefined => {
  let privateKey: Uint8Array;
  try {
    privateKey = base64ToBytes(privateKeyBase64);
  } catch {
    return undefined;
  }
  if (privateKey.length !== 32) {
    return undefined;
  }
  return `0x${Array.from(privateKey, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

export interface WalletProof {
  address: string;
  timestamp: number;
  signature: { signature: string; type: string };
}

// a proof may be dated this far ahead of the verifier's clock, and no further. Fixed, not a setting.
export const walletTimestampAllowanceSeconds = 300;

// the order of the secp256k1 curve, and its lower half: a signature's s must not exceed the half
const secp256k1Order = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const secp256k1HalfOrder = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n;

const walletAddressPattern = /^0x[0-9a-fA-F]{40}$/;
// r || s || v, 65 bytes
const walletSignaturePattern = /^0x[0-9a-fA-F]{130}$/;

// The one encoding a stored proof may have: v of 27 or 28 and s in the lower half of the curve
// order. Signers differ: some return v as 0 or 1, and a few return the high s form. Both are the
// same signature written another way, so they are rewritten here before a proof is stored.
// undefined when the value is not a 65 byte signature at all.
export const normalizeWalletSignature = (signature: string): Hex | undefined => {
  if (!walletSignaturePattern.test(signature)) {
    return undefined;
  }
  const r = signature.substring(2, 66);
  let s = BigInt(`0x${signature.substring(66, 130)}`);
  let v = Number.parseInt(signature.substring(130), 16);
  if (v === 0 || v === 1) {
    v += 27;
  }
  if (v !== 27 && v !== 28) {
    return undefined;
  }
  if (s > secp256k1HalfOrder) {
    // the high s twin recovers the same address with the other v
    s = secp256k1Order - s;
    v = v === 27 ? 28 : 27;
  }
  return `0x${r}${s.toString(16).padStart(64, '0')}${v.toString(16)}`;
};

// undefined when the proof is valid, otherwise why it is not. Offline: one hash and one public key
// recovery. The v and s rules are checked here because viem's recovery accepts both forms of each,
// and verifiers that follow their libraries would disagree about the same entry.
export const getWalletProofError = async (wallet: unknown, authorPublicKey: string | undefined, nowSeconds: number = Date.now() / 1000): Promise<string | undefined> => {
  const proof = wallet as Partial<WalletProof> | undefined;
  if (!authorPublicKey) {
    return 'the author has no public key';
  }
  if (!proof || typeof proof !== 'object') {
    return 'no wallet';
  }
  // a literal address only: a name here would need an RPC and changes meaning when repointed
  if (typeof proof.address !== 'string' || !walletAddressPattern.test(proof.address)) {
    return 'the wallet address is not a 0x address';
  }
  if (proof.signature?.type !== walletSignatureType) {
    return `the wallet signature type is not ${walletSignatureType}`;
  }
  if (typeof proof.timestamp !== 'number' || !Number.isSafeInteger(proof.timestamp) || proof.timestamp < 0) {
    return 'the wallet timestamp is not an integer';
  }
  if (proof.timestamp > nowSeconds + walletTimestampAllowanceSeconds) {
    return 'the wallet timestamp is in the future';
  }
  const signature = proof.signature.signature;
  if (typeof signature !== 'string' || !walletSignaturePattern.test(signature)) {
    return 'the wallet signature is not 65 bytes of hex';
  }
  const v = Number.parseInt(signature.substring(130), 16);
  if (v !== 27 && v !== 28) {
    return 'the wallet signature v is not 27 or 28';
  }
  if (BigInt(`0x${signature.substring(66, 130)}`) > secp256k1HalfOrder) {
    return 'the wallet signature s is in the upper half of the curve order';
  }
  try {
    const recovered = await recoverMessageAddress({ message: getWalletMessageToSign(authorPublicKey, proof.timestamp), signature: signature as Hex });
    return recovered.toLowerCase() === proof.address.toLowerCase() ? undefined : 'the wallet did not sign for this author';
  } catch {
    return 'the wallet signature is malformed';
  }
};

// ---------------------------------------------------------------------------------------------
// tipping/v1 public options
// ---------------------------------------------------------------------------------------------

export const tokensOptionName = 'tipping/v1/tokens';
export const feeRecipientOptionName = 'tipping/v1/feeRecipient';

export type TipTokenType = 'native' | 'erc20' | 'erc721';

// a percentage of the tip, or a flat amount. token is set only for an erc721 entry, whose fee is
// paid in that ERC-20; a fungible entry's fee is always paid in the entry's own token.
export type TipFee = { percent: string } | { amount: bigint; token?: Address };

// A chain is identified by its numeric chain id and nothing else. Tickers are free-form labels that
// two implementations can map to different networks; a chain id is what an RPC reports and what a
// transaction is signed for.
const isChainId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export interface TipToken {
  chainId: number;
  type: TipTokenType;
  // the token contract; undefined for native
  address?: Address;
  minAmount?: bigint;
  fee?: TipFee;
}

export interface TippingConfig {
  tokens: TipToken[];
  // without it no fee is due, whatever the tokens say
  feeRecipient?: Address;
  // the position of the tipping challenge in community.challenges: the key its pre-answer goes under
  challengeIndex: number;
}

const parseBaseUnits = (value: unknown): bigint | undefined => (typeof value === 'string' && /^\d+$/.test(value) ? BigInt(value) : undefined);

const percentPattern = /^\d+(\.\d+)?$/;

const parseFee = (fee: unknown, type: TipTokenType): TipFee | undefined | 'invalid' => {
  if (fee === undefined) {
    return undefined;
  }
  if (!fee || typeof fee !== 'object') {
    return 'invalid';
  }
  const { percent, amount, token } = fee as { percent?: unknown; amount?: unknown; token?: unknown };
  // one fee kind per token, so the required amount is unambiguous
  if ((percent === undefined) === (amount === undefined)) {
    return 'invalid';
  }
  if (percent !== undefined) {
    // an NFT can't be split
    if (type === 'erc721' || token !== undefined || typeof percent !== 'string' || !percentPattern.test(percent)) {
      return 'invalid';
    }
    return { percent };
  }
  const flat = parseBaseUnits(amount);
  if (flat === undefined) {
    return 'invalid';
  }
  if (type === 'erc721') {
    return typeof token === 'string' && isAddress(token, { strict: false }) ? { amount: flat, token: token as Address } : 'invalid';
  }
  return token === undefined ? { amount: flat } : 'invalid';
};

const parseToken = (entry: unknown): TipToken | undefined => {
  if (!entry || typeof entry !== 'object') {
    return undefined;
  }
  const { chainId, type, address, minAmount, fee } = entry as Record<string, unknown>;
  // a positive integer JSON number: an entry without one names no chain, and can't be tipped
  if (!isChainId(chainId)) {
    return undefined;
  }
  if (type !== 'native' && type !== 'erc20' && type !== 'erc721') {
    return undefined;
  }
  if (type === 'native' ? address !== undefined : typeof address !== 'string' || !isAddress(address, { strict: false })) {
    return undefined;
  }
  const parsedMinAmount = minAmount === undefined ? undefined : parseBaseUnits(minAmount);
  // an NFT tip has no amount to compare
  if (minAmount !== undefined && (parsedMinAmount === undefined || type === 'erc721')) {
    return undefined;
  }
  const parsedFee = parseFee(fee, type);
  if (parsedFee === 'invalid') {
    return undefined;
  }
  return { chainId, type, address: address as Address | undefined, minAmount: parsedMinAmount, fee: parsedFee };
};

interface CommunityLike {
  challenges?: unknown;
}

// A community supports tipping when one of its challenges publishes a tipping/v1/tokens list this
// client can read. The record does not say which challenge package produced the options, and this
// never asks. Anything unreadable means no tipping, never a throw: a malformed option must cost the
// tip button, not the community view. An entry this client cannot read is dropped on its own,
// because a token whose fee or minimum is unknown cannot be tipped safely.
export const getTippingConfig = (community: CommunityLike | undefined): TippingConfig | undefined => {
  const challenges = community?.challenges;
  if (!Array.isArray(challenges)) {
    return undefined;
  }
  for (const [challengeIndex, challenge] of challenges.entries()) {
    const publicOptions: unknown = challenge?.publicOptions;
    if (!publicOptions || typeof publicOptions !== 'object') {
      continue;
    }
    const tokensOption = (publicOptions as Record<string, unknown>)[tokensOptionName];
    if (typeof tokensOption !== 'string') {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(tokensOption);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) {
      continue;
    }
    const tokens = parsed.flatMap((entry) => parseToken(entry) ?? []);
    if (!tokens.length) {
      continue;
    }
    const feeRecipientOption = (publicOptions as Record<string, unknown>)[feeRecipientOptionName];
    const feeRecipient = typeof feeRecipientOption === 'string' && isAddress(feeRecipientOption, { strict: false }) ? (feeRecipientOption as Address) : undefined;
    return { tokens, feeRecipient, challengeIndex };
  }
  return undefined;
};

// identifies a token across the config, a tip and the totals
export const getTokenKey = (token: { chainId: number; type: string; address?: string }): string => `${token.chainId}:${token.type}:${token.address?.toLowerCase() ?? ''}`;

// ---------------------------------------------------------------------------------------------
// fee
// ---------------------------------------------------------------------------------------------

export interface RequiredFee {
  // the ERC-20 the fee is paid in; undefined when it is paid in the chain's native coin
  token?: Address;
  amount: bigint;
}

// The fee a tip owes, paid on top of the tip. A percentage is rounded up, so the amount sent never
// falls below what the community computes whichever way it rounds.
export const getRequiredFee = (config: TippingConfig, token: TipToken, amount: bigint): RequiredFee | undefined => {
  if (!config.feeRecipient || !token.fee) {
    return undefined;
  }
  let feeAmount: bigint;
  if ('percent' in token.fee) {
    const [whole, fraction = ''] = token.fee.percent.split('.');
    const numerator = BigInt(whole + fraction);
    const denominator = 100n * 10n ** BigInt(fraction.length);
    feeAmount = (amount * numerator + denominator - 1n) / denominator;
  } else {
    feeAmount = token.fee.amount;
  }
  if (feeAmount <= 0n) {
    return undefined;
  }
  if (token.type === 'erc721') {
    return 'token' in token.fee && token.fee.token ? { token: token.fee.token, amount: feeAmount } : undefined;
  }
  return { token: token.address, amount: feeAmount };
};

// ---------------------------------------------------------------------------------------------
// amounts
// ---------------------------------------------------------------------------------------------

// '1.5' with 6 decimals -> 1500000n. undefined for anything that is not a positive decimal number
// with at most that many decimals.
export const parseTokenAmount = (value: string, decimals: number): bigint | undefined => {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed) || (trimmed.split('.')[1]?.length ?? 0) > decimals) {
    return undefined;
  }
  try {
    const amount = parseUnits(trimmed, decimals);
    return amount > 0n ? amount : undefined;
  } catch {
    return undefined;
  }
};

export const formatTokenAmount = (amount: bigint, decimals: number): string => formatUnits(amount, decimals);

// why a tip of this size cannot be sent, or undefined
export const getTipAmountError = (token: TipToken, amount: bigint | undefined): string | undefined => {
  if (amount === undefined || amount <= 0n) {
    return 'invalid amount';
  }
  if (token.minAmount !== undefined && amount < token.minAmount) {
    return 'below the minimum tip';
  }
  return undefined;
};

// ---------------------------------------------------------------------------------------------
// the claim a tipper publishes, and the tip a community writes
// ---------------------------------------------------------------------------------------------

export interface TipClaim {
  chainId: number;
  txHash: Hash;
  // left out when no fee was due, equal to txHash when the fee went in the same transaction
  feeTxHash?: Hash;
}

export const buildTipClaim = (chainId: number, txHash: string, feeTxHash?: string): TipClaim => {
  if (!isChainId(chainId)) {
    throw Error('tip claim chain id is not a positive integer');
  }
  if (!isHash(txHash)) {
    throw Error('tip claim tx hash is not a transaction hash');
  }
  if (feeTxHash !== undefined && !isHash(feeTxHash)) {
    throw Error('tip claim fee tx hash is not a transaction hash');
  }
  return feeTxHash === undefined ? { chainId, txHash } : { chainId, txHash, feeTxHash };
};

// How the claim rides on the published reply: as the pre-answer of the tipping challenge. pkc-js
// (0.0.152 and later) takes pre-answers as a record keyed by challenge index, as a decimal string,
// and challenge answers are strings, so the claim travels as JSON text. The claim is not part of the
// signed comment.
export const getTipClaimPublishOptions = (claim: TipClaim, challengeIndex: number): { challengeRequest: { challengeAnswers: Record<string, string> } } => ({
  challengeRequest: { challengeAnswers: { [String(challengeIndex)]: JSON.stringify(claim) } },
});

// what the tipping challenge writes to commentUpdate.tip once it has verified the claim on chain
export interface Tip {
  chainId: number;
  txHash: string;
  type: TipTokenType;
  // the token contract; undefined for native
  token?: string;
  from: string;
  to: string;
  // base units, for native and erc20
  amount?: bigint;
  // for erc721
  tokenId?: string;
  // the community's fee, paid by the tipper in its own transaction
  fee?: TipFeePaid;
}

export interface TipFeePaid {
  txHash: string;
  to: string;
  amount: bigint;
  // the ERC-20 the fee was paid in; undefined for the chain's coin
  token?: string;
}

interface CommentLike {
  tip?: unknown;
  parentCid?: unknown;
}

const parseFeePaid = (fee: unknown): TipFeePaid | undefined => {
  if (!fee || typeof fee !== 'object') {
    return undefined;
  }
  const { txHash, to, amount, token } = fee as Record<string, unknown>;
  const parsedAmount = parseBaseUnits(amount);
  if (typeof txHash !== 'string' || typeof to !== 'string' || parsedAmount === undefined || (token !== undefined && typeof token !== 'string')) {
    return undefined;
  }
  return { txHash, to, amount: parsedAmount, token };
};

// the verified tip on a comment, or undefined when it has none or its shape is not one this client reads
export const getTip = (comment: CommentLike | undefined): Tip | undefined => {
  const tip = comment?.tip;
  if (!tip || typeof tip !== 'object') {
    return undefined;
  }
  const { chainId, txHash, type, token, from, to, amount, tokenId, fee } = tip as Record<string, unknown>;
  if (!isChainId(chainId) || typeof txHash !== 'string' || typeof from !== 'string' || typeof to !== 'string') {
    return undefined;
  }
  if (type !== 'native' && type !== 'erc20' && type !== 'erc721') {
    return undefined;
  }
  if (type === 'native' ? token !== undefined : typeof token !== 'string') {
    return undefined;
  }
  const tipType: TipTokenType = type;
  const paid = parseFeePaid(fee);
  if (fee !== undefined && !paid) {
    return undefined;
  }
  const base = { chainId, txHash, type: tipType, token: token as string | undefined, from, to, ...(paid && { fee: paid }) };
  if (type === 'erc721') {
    return typeof tokenId === 'string' ? { ...base, tokenId } : undefined;
  }
  const parsedAmount = parseBaseUnits(amount);
  return parsedAmount === undefined ? undefined : { ...base, amount: parsedAmount };
};

// What the tipping config says about a tip's fee: that it went to the community's fee recipient, in
// the token and for at least the amount owed. undefined when it matches or no fee is owed.
export const getTipFeeConfigError = (config: TippingConfig, tip: Tip): string | undefined => {
  const token = config.tokens.find((entry) => getTokenKey(entry) === getTokenKey({ chainId: tip.chainId, type: tip.type, address: tip.token }));
  if (!token) {
    return 'the community does not list this token';
  }
  const required = getRequiredFee(config, token, tip.type === 'erc721' ? 0n : (tip.amount ?? 0n));
  if (!required) {
    return undefined;
  }
  if (!tip.fee) {
    return 'the community requires a fee and the tip has none';
  }
  if (tip.fee.to.toLowerCase() !== config.feeRecipient?.toLowerCase()) {
    return 'the fee did not go to the community fee recipient';
  }
  if ((tip.fee.token?.toLowerCase() ?? '') !== (required.token?.toLowerCase() ?? '')) {
    return 'the fee was paid in another token than the community asks';
  }
  return tip.fee.amount < required.amount ? 'the fee is below what the community asks' : undefined;
};

export interface TipTotal {
  chainId: number;
  type: TipTokenType;
  token?: string;
  // summed base units for native and erc20; undefined for erc721
  amount?: bigint;
  // how many tips went into this total
  count: number;
}

// one total per token on a chain
export const sumTips = (tips: Tip[]): TipTotal[] => {
  const totals = new Map<string, TipTotal>();
  for (const tip of tips) {
    const key = getTokenKey({ chainId: tip.chainId, type: tip.type, address: tip.token });
    const total = totals.get(key) ?? { chainId: tip.chainId, type: tip.type, token: tip.token, amount: tip.type === 'erc721' ? undefined : 0n, count: 0 };
    total.count += 1;
    if (tip.amount !== undefined && total.amount !== undefined) {
      total.amount += tip.amount;
    }
    totals.set(key, total);
  }
  return [...totals.values()];
};

// ---------------------------------------------------------------------------------------------
// verifying a tip before it is shown
// ---------------------------------------------------------------------------------------------

interface TipParty {
  cid?: unknown;
  parentCid?: unknown;
  tip?: unknown;
  author?: { wallets?: unknown };
  signature?: { publicKey?: unknown };
}

const getPartyKeyAddress = (party: TipParty | undefined): string | undefined =>
  typeof party?.signature?.publicKey === 'string' ? getKeyAddressFromPublicKey(party.signature.publicKey) : undefined;

// The addresses a publication's author has proven, in ascending order of their author.wallets key.
// Every entry whose proof verifies counts, whatever its key: the key is a label the author chose,
// and the proof shows control of the address on every chain where the same key controls it.
export const getProvenWalletAddresses = async (party: TipParty | undefined, nowSeconds?: number): Promise<string[]> => {
  const wallets = party?.author?.wallets;
  const keyAddress = getPartyKeyAddress(party);
  if (!wallets || typeof wallets !== 'object' || !keyAddress) {
    return [];
  }
  // code unit order, so every client sorts the same way
  const keys = Object.keys(wallets).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const addresses = await Promise.all(
    keys.map(async (key) => {
      const wallet = (wallets as Record<string, unknown>)[key];
      return (await getWalletProofError(wallet, keyAddress, nowSeconds)) ? undefined : (wallet as WalletProof).address;
    }),
  );
  return addresses.flatMap((address) => address ?? []);
};

// Where a tip to this comment's author is sent: the author's `eth` entry if its proof verifies,
// otherwise the first proven entry by key in ascending order. undefined when the author has proven
// no wallet, and then the author can't be tipped.
export const getTipRecipientAddress = async (party: TipParty | undefined, nowSeconds?: number): Promise<string | undefined> => {
  const wallets = party?.author?.wallets;
  const eth = wallets && typeof wallets === 'object' ? (wallets as Record<string, unknown>).eth : undefined;
  if (eth && !(await getWalletProofError(eth, getPartyKeyAddress(party), nowSeconds))) {
    return (eth as WalletProof).address;
  }
  return (await getProvenWalletAddresses(party, nowSeconds))[0];
};

const includesAddress = (addresses: string[], address: string): boolean => addresses.some((proven) => proven.toLowerCase() === address.toLowerCase());

// What the offline check of a tip found out. The check is all signature work on the two comments,
// no RPC call, and every part is reported so the reader can be shown which one failed.
export interface TipCheck {
  tip: Tip;
  // the reply is a reply to the tipped comment, which is loaded
  isReplyToParent: boolean;
  // the tip's sender is an address the tipper has proven
  senderProven: boolean;
  // the tip's receiver is an address the tipped author has proven
  receiverProven: boolean;
}

// why a tip did not verify, or undefined when it did
export const getTipCheckError = (check: TipCheck): string | undefined =>
  !check.isReplyToParent
    ? 'the tipped comment is not loaded, or this is not a reply to it'
    : !check.senderProven
      ? 'the sender is not a wallet the tipper proved'
      : !check.receiverProven
        ? 'the receiver is not a wallet the tipped author proved'
        : undefined;

// Checks the tip a reply carries against the two comments it connects. Undefined when the reply has no
// tip this client reads. Showing a tip presents its sender and receiver as wallets those authors
// control, and a community's acceptance can't stand in for the reader's own check: nothing in a
// comment says whether its community verified wallet proofs. So a tip counts as verified only when
// - the reply is a reply to the tipped comment,
// - the tip's sender is an address the tipper has proven,
// - the tip's receiver is an address the tipped author has proven.
// All of it is offline. Whether the transaction exists is the community's word, not checked here.
export const checkTip = async (reply: TipParty | undefined, parent: TipParty | undefined, nowSeconds?: number): Promise<TipCheck | undefined> => {
  const tip = getTip(reply);
  if (!tip) {
    return undefined;
  }
  if (!parent || typeof parent.cid !== 'string' || reply?.parentCid !== parent.cid) {
    return { tip, isReplyToParent: false, senderProven: false, receiverProven: false };
  }
  const [tipperAddresses, recipientAddresses] = await Promise.all([getProvenWalletAddresses(reply, nowSeconds), getProvenWalletAddresses(parent, nowSeconds)]);
  return { tip, isReplyToParent: true, senderProven: includesAddress(tipperAddresses, tip.from), receiverProven: includesAddress(recipientAddresses, tip.to) };
};

// The tip a reply carries once it verifies, or undefined.
export const verifyTip = async (reply: TipParty | undefined, parent: TipParty | undefined, nowSeconds?: number): Promise<Tip | undefined> => {
  const check = await checkTip(reply, parent, nowSeconds);
  return check && !getTipCheckError(check) ? check.tip : undefined;
};

// everything verifyTip reads, so the same inputs give the same promise and changed ones a new check
const getVerifiedTipKey = (reply: TipParty, parent: TipParty): string | undefined => {
  try {
    return JSON.stringify([
      reply.cid,
      reply.parentCid,
      reply.tip,
      reply.author?.wallets,
      reply.signature?.publicKey,
      parent.cid,
      parent.author?.wallets,
      parent.signature?.publicKey,
    ]);
  } catch {
    return undefined;
  }
};

const cacheLimit = 2000;
const verifiedTips = new Map<string, Promise<Tip | undefined>>();
const verifiedTipTotals = new Map<string, Promise<TipTotal[]>>();
const tipChecks = new Map<string, Promise<TipCheck | undefined>>();
const noTip: Promise<Tip | undefined> = Promise.resolve(undefined);
const noCheck: Promise<TipCheck | undefined> = Promise.resolve(undefined);
const noTotals: Promise<TipTotal[]> = Promise.resolve([]);

const remember = <Value>(cache: Map<string, Value>, key: string, value: Value): Value => {
  if (cache.size >= cacheLimit) {
    cache.clear();
  }
  cache.set(key, value);
  return value;
};

// checkTip with the promise kept per input, so a component can read it with React's use()
export const getTipCheck = (reply: TipParty | undefined, parent: TipParty | undefined): Promise<TipCheck | undefined> => {
  const key = getTip(reply) && reply && parent ? getVerifiedTipKey(reply, parent) : undefined;
  if (!key) {
    return noCheck;
  }
  return tipChecks.get(key) ?? remember(tipChecks, key, checkTip(reply, parent));
};

// verifyTip with the promise kept per input
export const getVerifiedTip = (reply: TipParty | undefined, parent: TipParty | undefined): Promise<Tip | undefined> => {
  const key = getTip(reply) && reply && parent ? getVerifiedTipKey(reply, parent) : undefined;
  if (!key) {
    return noTip;
  }
  return (
    verifiedTips.get(key) ??
    remember(
      verifiedTips,
      key,
      getTipCheck(reply, parent).then((check) => (check && !getTipCheckError(check) ? check.tip : undefined)),
    )
  );
};

// the replies of a comment that carry something shaped like a tip, verified or not
export const getTipReplies = <Reply extends TipParty>(parent: TipParty | undefined, replies: (Reply | undefined)[] | undefined): Reply[] =>
  // flat reply sorts list a whole subtree, so keep only the replies to this comment
  typeof parent?.cid === 'string' ? (replies ?? []).flatMap((reply) => (reply && reply.parentCid === parent.cid && getTip(reply) ? [reply] : [])) : [];

// What a comment was tipped: the verified tips on its loaded replies, summed per chain and token. A community
// cannot write to the tipped comment's own update, so this is the only total there is, and it
// covers only the replies the client has loaded. A tip that fails verifyTip is left out.
export const getVerifiedTipTotals = (parent: TipParty | undefined, replies: (TipParty | undefined)[] | undefined): Promise<TipTotal[]> => {
  const tipReplies = getTipReplies(parent, replies);
  if (!parent || !tipReplies.length) {
    return noTotals;
  }
  const keys = tipReplies.map((reply) => getVerifiedTipKey(reply, parent));
  const key = JSON.stringify(keys);
  return (
    verifiedTipTotals.get(key) ??
    remember(
      verifiedTipTotals,
      key,
      Promise.all(tipReplies.map((reply) => getVerifiedTip(reply, parent))).then((tips) => sumTips(tips.flatMap((tip) => tip ?? []))),
    )
  );
};
