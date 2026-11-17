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

export interface TipToken {
  chainTicker: string;
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
  const { chainTicker, type, address, minAmount, fee } = entry as Record<string, unknown>;
  if (typeof chainTicker !== 'string' || !chainTicker) {
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
  return { chainTicker, type, address: address as Address | undefined, minAmount: parsedMinAmount, fee: parsedFee };
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
  for (const challenge of challenges) {
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
    return { tokens, feeRecipient };
  }
  return undefined;
};

// identifies a token across the config, a tip and the totals
export const getTokenKey = (token: { chainTicker: string; type: string; address?: string }): string =>
  `${token.chainTicker}:${token.type}:${token.address?.toLowerCase() ?? ''}`;

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
  chainTicker: string;
  txHash: Hash;
  // left out when no fee was due, equal to txHash when the fee went in the same transaction
  feeTxHash?: Hash;
}

export const buildTipClaim = (chainTicker: string, txHash: string, feeTxHash?: string): TipClaim => {
  if (!chainTicker) {
    throw Error('tip claim missing chain ticker');
  }
  if (!isHash(txHash)) {
    throw Error('tip claim tx hash is not a transaction hash');
  }
  if (feeTxHash !== undefined && !isHash(feeTxHash)) {
    throw Error('tip claim fee tx hash is not a transaction hash');
  }
  return feeTxHash === undefined ? { chainTicker, txHash } : { chainTicker, txHash, feeTxHash };
};

// Where the claim rides on the published reply. tipping/v1 puts it at the top level of the
// comment, but pkc-js 0.0.148 rejects an unknown top-level key in createComment
// (ERR_INVALID_CREATE_COMMENT_ARGS_SCHEMA), while unknown keys under author are accepted and
// signed. 'author' is therefore the only location that publishes today.
export type TipClaimLocation = 'author' | 'comment';

export const getTipClaimPublishOptions = (claim: TipClaim, location: TipClaimLocation): { tip: TipClaim } | { author: { tip: TipClaim } } =>
  location === 'comment' ? { tip: claim } : { author: { tip: claim } };

// what the tipping challenge writes to commentUpdate.tip once it has verified the claim on chain
export interface Tip {
  chainTicker: string;
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
}

interface CommentLike {
  tip?: unknown;
  parentCid?: unknown;
}

// the verified tip on a comment, or undefined when it has none or its shape is not one this client reads
export const getTip = (comment: CommentLike | undefined): Tip | undefined => {
  const tip = comment?.tip;
  if (!tip || typeof tip !== 'object') {
    return undefined;
  }
  const { chainTicker, txHash, type, token, from, to, amount, tokenId } = tip as Record<string, unknown>;
  if (typeof chainTicker !== 'string' || typeof txHash !== 'string' || typeof from !== 'string' || typeof to !== 'string') {
    return undefined;
  }
  if (type !== 'native' && type !== 'erc20' && type !== 'erc721') {
    return undefined;
  }
  if (type === 'native' ? token !== undefined : typeof token !== 'string') {
    return undefined;
  }
  const tipType: TipTokenType = type;
  const base = { chainTicker, txHash, type: tipType, token: token as string | undefined, from, to };
  if (type === 'erc721') {
    return typeof tokenId === 'string' ? { ...base, tokenId } : undefined;
  }
  const parsedAmount = parseBaseUnits(amount);
  return parsedAmount === undefined ? undefined : { ...base, amount: parsedAmount };
};

export interface TipTotal {
  chainTicker: string;
  type: TipTokenType;
  token?: string;
  // summed base units for native and erc20; undefined for erc721
  amount?: bigint;
  // how many tips went into this total
  count: number;
}

// one total per token
export const sumTips = (tips: Tip[]): TipTotal[] => {
  const totals = new Map<string, TipTotal>();
  for (const tip of tips) {
    const key = getTokenKey({ chainTicker: tip.chainTicker, type: tip.type, address: tip.token });
    const total = totals.get(key) ?? { chainTicker: tip.chainTicker, type: tip.type, token: tip.token, amount: tip.type === 'erc721' ? undefined : 0n, count: 0 };
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
  author?: { wallets?: Record<string, unknown> };
  signature?: { publicKey?: unknown };
}

const isSameAddress = (a: string, b: unknown): boolean => typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

const getPartyKeyAddress = (party: TipParty | undefined): string | undefined =>
  typeof party?.signature?.publicKey === 'string' ? getKeyAddressFromPublicKey(party.signature.publicKey) : undefined;

// The tip a reply carries, once it holds up against the two comments it connects, or undefined.
// Showing a tip presents its sender and receiver as wallets those authors control, and a community's
// acceptance can't stand in for the reader's own check: nothing in a comment says whether its
// community verified wallet proofs. So the tip is shown only when
// - the reply is a reply to the tipped comment,
// - the tipper's wallet for the tip's chain is proven, and is the tip's sender,
// - the tipped author's wallet for that chain is proven, and is the tip's receiver.
// All of it is offline. Whether the transaction exists is the community's word, not checked here.
export const verifyTip = async (reply: TipParty | undefined, parent: TipParty | undefined, nowSeconds?: number): Promise<Tip | undefined> => {
  const tip = getTip(reply);
  if (!tip || !parent || typeof parent.cid !== 'string' || reply?.parentCid !== parent.cid) {
    return undefined;
  }
  const tipperWallet = reply?.author?.wallets?.[tip.chainTicker] as Partial<WalletProof> | undefined;
  const recipientWallet = parent.author?.wallets?.[tip.chainTicker] as Partial<WalletProof> | undefined;
  if (!isSameAddress(tip.from, tipperWallet?.address) || !isSameAddress(tip.to, recipientWallet?.address)) {
    return undefined;
  }
  const [tipperError, recipientError] = await Promise.all([
    getWalletProofError(tipperWallet, getPartyKeyAddress(reply), nowSeconds),
    getWalletProofError(recipientWallet, getPartyKeyAddress(parent), nowSeconds),
  ]);
  return tipperError || recipientError ? undefined : tip;
};

// everything verifyTip reads, so the same inputs give the same promise and changed ones a new check
const getVerifiedTipKey = (reply: TipParty, parent: TipParty, chainTicker: string): string | undefined => {
  try {
    return JSON.stringify([
      reply.cid,
      reply.parentCid,
      reply.tip,
      reply.author?.wallets?.[chainTicker],
      reply.signature?.publicKey,
      parent.cid,
      parent.author?.wallets?.[chainTicker],
      parent.signature?.publicKey,
    ]);
  } catch {
    return undefined;
  }
};

const cacheLimit = 2000;
const verifiedTips = new Map<string, Promise<Tip | undefined>>();
const verifiedTipTotals = new Map<string, Promise<TipTotal[]>>();
const noTip: Promise<Tip | undefined> = Promise.resolve(undefined);
const noTotals: Promise<TipTotal[]> = Promise.resolve([]);

const remember = <Value>(cache: Map<string, Value>, key: string, value: Value): Value => {
  if (cache.size >= cacheLimit) {
    cache.clear();
  }
  cache.set(key, value);
  return value;
};

// verifyTip with the promise kept per input, so a component can read it with React's use()
export const getVerifiedTip = (reply: TipParty | undefined, parent: TipParty | undefined): Promise<Tip | undefined> => {
  const tip = getTip(reply);
  const key = tip && reply && parent ? getVerifiedTipKey(reply, parent, tip.chainTicker) : undefined;
  if (!key) {
    return noTip;
  }
  return verifiedTips.get(key) ?? remember(verifiedTips, key, verifyTip(reply, parent));
};

// the replies of a comment that carry something shaped like a tip, verified or not
export const getTipReplies = <Reply extends TipParty>(parent: TipParty | undefined, replies: (Reply | undefined)[] | undefined): Reply[] =>
  // flat reply sorts list a whole subtree, so keep only the replies to this comment
  typeof parent?.cid === 'string' ? (replies ?? []).flatMap((reply) => (reply && reply.parentCid === parent.cid && getTip(reply) ? [reply] : [])) : [];

// What a comment was tipped: the verified tips on its loaded replies, summed per token. A community
// cannot write to the tipped comment's own update, so this is the only total there is, and it
// covers only the replies the client has loaded. A tip that fails verifyTip is left out.
export const getVerifiedTipTotals = (parent: TipParty | undefined, replies: (TipParty | undefined)[] | undefined): Promise<TipTotal[]> => {
  const tipReplies = getTipReplies(parent, replies);
  if (!parent || !tipReplies.length) {
    return noTotals;
  }
  const keys = tipReplies.map((reply) => getVerifiedTipKey(reply, parent, getTip(reply)?.chainTicker ?? ''));
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
