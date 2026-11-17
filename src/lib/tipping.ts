// Pure logic for the tipping/v1 contract and the author wallet proof. No React, no network, and no
// relative imports, so scripts/__tests__/tipping.node-test.mjs can import this file directly.
import { formatUnits, isAddress, isHash, parseUnits, verifyMessage } from 'viem';
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

// undefined when the proof is valid, otherwise why it is not
export const getWalletProofError = async (wallet: unknown, authorPublicKey: string | undefined, nowSeconds: number = Date.now() / 1000): Promise<string | undefined> => {
  const proof = wallet as Partial<WalletProof> | undefined;
  if (!authorPublicKey) {
    return 'the author has no public key';
  }
  if (!proof || typeof proof !== 'object') {
    return 'no wallet';
  }
  // a literal address only: a name here would need an RPC and changes meaning when repointed
  if (typeof proof.address !== 'string' || !isAddress(proof.address, { strict: false })) {
    return 'the wallet address is not a 0x address';
  }
  if (proof.signature?.type !== walletSignatureType) {
    return `the wallet signature type is not ${walletSignatureType}`;
  }
  if (typeof proof.timestamp !== 'number' || !Number.isInteger(proof.timestamp)) {
    return 'the wallet timestamp is not an integer';
  }
  if (proof.timestamp > nowSeconds) {
    return 'the wallet timestamp is in the future';
  }
  if (typeof proof.signature.signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(proof.signature.signature)) {
    return 'the wallet signature is not hex';
  }
  try {
    const valid = await verifyMessage({
      address: proof.address as Address,
      message: getWalletMessageToSign(authorPublicKey, proof.timestamp),
      signature: proof.signature.signature as Hex,
    });
    return valid ? undefined : 'the wallet did not sign for this author';
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

// Sums the verified tips on the loaded replies to a comment, one total per token. A community
// cannot write to the tipped comment's own update, so this is the only total there is, and it
// covers only the replies the client has loaded.
export const getTipTotals = (parentCid: string | undefined, replies: (CommentLike | undefined)[] | undefined): TipTotal[] => {
  const totals = new Map<string, TipTotal>();
  for (const reply of replies ?? []) {
    // flat reply sorts list a whole subtree, so keep only the tips on this comment
    if (!parentCid || reply?.parentCid !== parentCid) {
      continue;
    }
    const tip = getTip(reply);
    if (!tip) {
      continue;
    }
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
