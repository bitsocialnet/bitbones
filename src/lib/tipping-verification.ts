// What a tip has to pass before it is shown: the offline wallet-proof check, then a lookup of its
// transaction on its chain. The outcome of the lookup is kept in localStorage once the transaction is
// final, so a tip costs its RPC calls once. Only type imports are relative here, so the Node suite
// can load this file with its types stripped.
import { keccak256, stringToHex } from 'viem';
import type { Tip, TipCheck } from './tipping';
import type { OnChainTipCheck, OnChainTipResult } from './tipping-chain';

// how deep a transaction has to be before what the chain says about it is kept for good
export const finalityConfirmations = 12;

export const verifiedTipsStorageKey = 'bitbonesVerifiedTips';

// why a transaction is not the one a tip or its fee claims, or undefined when it is
export const getOnChainError = (result: OnChainTipCheck, what: string): string | undefined => {
  if (!result.mined) {
    return `the ${what} transaction was not found on this chain`;
  }
  if (!result.succeeded) {
    return `the ${what} transaction failed`;
  }
  if (!result.sentByTipper) {
    return `the ${what} transaction was not sent by a wallet the tipper proved`;
  }
  if (!result.hasBinding) {
    return `the ${what} transaction does not end with the parent binding of the tipped comment`;
  }
  if (!result.matchesTip) {
    return `the ${what} transaction is not a transfer of this token to this wallet of this amount`;
  }
  return undefined;
};

// One result per tip as the community wrote it, on the two comments it connects. The tip's own fields
// are part of the key: a community can rewrite the tip in a later update, and a result found for one
// amount or receiver says nothing about another. Hashed to keep an entry short.
export const getTipResultKey = (tip: Tip, replyCid: string, parentCid: string): string =>
  keccak256(
    stringToHex(
      JSON.stringify([
        tip.chainId,
        tip.txHash.toLowerCase(),
        tip.type,
        tip.token?.toLowerCase() ?? '',
        tip.from.toLowerCase(),
        tip.to.toLowerCase(),
        tip.amount?.toString() ?? '',
        tip.tokenId ?? '',
        replyCid,
        parentCid,
      ]),
    ),
  );

// true for a tip that passed; for one that failed, what the chain said, so the reason can be shown
// again without asking the chain
export type StoredTipResult = true | OnChainTipCheck;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const getDefaultStorage = (): StorageLike | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

const onChainFacts = ['mined', 'succeeded', 'sentByTipper', 'hasBinding', 'matchesTip'] as const;

// the five facts alone, whatever else the object carries
const pickOnChainFacts = (result: OnChainTipCheck): OnChainTipCheck => ({
  mined: result.mined,
  succeeded: result.succeeded,
  sentByTipper: result.sentByTipper,
  hasBinding: result.hasBinding,
  matchesTip: result.matchesTip,
});

const parseStoredResult = (value: unknown): StoredTipResult | undefined => {
  if (value === true) {
    return true;
  }
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const facts = value as Record<string, unknown>;
  return onChainFacts.every((fact) => typeof facts[fact] === 'boolean') ? pickOnChainFacts(facts as unknown as OnChainTipCheck) : undefined;
};

// the last text read from storage and what it parsed to: a thread can verify many tips in a row
let lastRead: { text: string; results: Record<string, StoredTipResult> } | undefined;

export const readStoredTipResults = (storage: StorageLike | undefined = getDefaultStorage()): Record<string, StoredTipResult> => {
  let text: string | null | undefined;
  try {
    text = storage?.getItem(verifiedTipsStorageKey);
  } catch {}
  if (!text) {
    return {};
  }
  if (lastRead?.text === text) {
    return lastRead.results;
  }
  const results: Record<string, StoredTipResult> = {};
  try {
    const stored: unknown = JSON.parse(text);
    for (const [key, value] of Object.entries(stored && typeof stored === 'object' ? stored : {})) {
      const result = parseStoredResult(value);
      if (result) {
        results[key] = result;
      }
    }
  } catch {}
  lastRead = { text, results };
  return results;
};

// Sets one tip's result, or forgets it when `result` is undefined. Storage is read again first, so a
// result another tab wrote in the meantime is kept.
export const writeStoredTipResult = (key: string, result: StoredTipResult | undefined, storage: StorageLike | undefined = getDefaultStorage()): void => {
  if (!storage) {
    return;
  }
  const results = { ...readStoredTipResults(storage) };
  if (result === undefined) {
    if (!(key in results)) {
      return;
    }
    delete results[key];
  } else {
    results[key] = result === true ? true : pickOnChainFacts(result);
  }
  try {
    storage.setItem(verifiedTipsStorageKey, JSON.stringify(results));
  } catch {}
};

// What of a lookup is kept for good, or undefined when it has to be asked again. A transaction that is
// deep enough does not change, so neither does what it says: that it is the tip, or that it reverted,
// was sent by someone else, lacks the binding or moves something else. A transaction that is missing or
// still shallow can yet change, and a lookup that could not be made says nothing.
export const getResultToStore = (result: OnChainTipCheck, confirmations: number | undefined): StoredTipResult | undefined => {
  if (!result.mined || confirmations === undefined || confirmations < finalityConfirmations) {
    return undefined;
  }
  return getOnChainError(result, 'tip') ? pickOnChainFacts(result) : true;
};

type OfflineFacts = Pick<TipCheck, 'isReplyToParent' | 'senderProven' | 'receiverProven'>;

export interface TipVerificationFailure {
  status: 'failed';
  tip: Tip;
  resultKey: string;
  // one line, for the row
  error: string;
  offline: OfflineFacts;
  // what the chain said about the tip's transaction, when it was asked
  onChain?: OnChainTipCheck;
  // the RPC's own error, when the chain could not be asked. The RPC url is cut out of it.
  rpcError?: string;
  // the failure is the stored one, and is not asked again until rechecked
  stored: boolean;
}

export type TipVerification =
  | { status: 'verified'; tip: Tip; resultKey: string }
  | { status: 'no-rpc'; tip: Tip; resultKey: string }
  // the tip verifies, and so does an earlier reply that claims the same transaction
  | { status: 'repeated'; tip: Tip; resultKey: string }
  | TipVerificationFailure;

// One payment is one tip: a verified tip is a repeat once an earlier reply that claims the same
// transaction verifies too. An earlier claim that does not verify takes nothing from this one.
export const rankTipVerification = (verification: TipVerification | undefined, earlierClaims: (TipVerification | undefined)[]): TipVerification | undefined =>
  verification?.status === 'verified' && earlierClaims.some((earlier) => earlier?.status === 'verified')
    ? { status: 'repeated', tip: verification.tip, resultKey: verification.resultKey }
    : verification;

export interface CheckedTip {
  // the offline check of the tip, and why it failed if it did
  check: TipCheck;
  offlineError?: string;
  replyCid: string;
  parentCid: string;
  // the RPC of the tip's chain, when one is set
  rpcUrl?: string;
}

// RPC urls often carry an API key, and an error is shown and copied
const withoutRpcUrl = (message: string, rpcUrl: string): string => message.split(rpcUrl).join('[rpc url]');

// Decides whether a tip is shown. The fee a community asks is not part of it: it is between the tipper
// and the community, and the tip reached its receiver either way. Never rejects.
export const verifyCheckedTip = async (
  { check, offlineError, replyCid, parentCid, rpcUrl }: CheckedTip,
  checkOnChain: (rpcUrl: string, tip: Tip) => Promise<OnChainTipResult>,
  storage: StorageLike | undefined = getDefaultStorage(),
): Promise<TipVerification> => {
  const { tip } = check;
  const resultKey = getTipResultKey(tip, replyCid, parentCid);
  const offline: OfflineFacts = { isReplyToParent: check.isReplyToParent, senderProven: check.senderProven, receiverProven: check.receiverProven };
  const failed = (failure: Pick<TipVerificationFailure, 'error' | 'onChain' | 'rpcError' | 'stored'>): TipVerificationFailure => ({
    status: 'failed',
    tip,
    resultKey,
    offline,
    ...failure,
  });
  // the wallet proofs are checked on every display, before anything stored is trusted
  if (offlineError) {
    return failed({ error: offlineError, stored: false });
  }
  const stored = readStoredTipResults(storage)[resultKey];
  if (stored === true) {
    return { status: 'verified', tip, resultKey };
  }
  if (stored) {
    return failed({ error: getOnChainError(stored, 'tip') ?? 'the tip transaction failed its check', onChain: stored, stored: true });
  }
  if (!rpcUrl) {
    return { status: 'no-rpc', tip, resultKey };
  }
  let result: OnChainTipResult;
  try {
    // the fee is left out of the lookup too: a fee transaction that can't be read must not fail the tip
    const { fee: _fee, ...tipWithoutFee } = tip;
    result = await checkOnChain(rpcUrl, tipWithoutFee);
  } catch (error) {
    const rpcError = withoutRpcUrl(error instanceof Error ? error.message : String(error), rpcUrl);
    return failed({ error: `could not check the chain: ${rpcError.split('\n')[0]}`, rpcError, stored: false });
  }
  const onChain = pickOnChainFacts(result.tip);
  const toStore = getResultToStore(onChain, result.confirmations);
  if (toStore) {
    writeStoredTipResult(resultKey, toStore, storage);
  }
  const error = getOnChainError(onChain, 'tip');
  return error ? failed({ error, onChain, stored: toStore !== undefined }) : { status: 'verified', tip, resultKey };
};

// Whether a failure can still turn into another answer, and so is asked of the chain again while the
// tip is on screen: the RPC could not answer, or what it said is not final. A tip is often seen
// before its transaction is mined. A failed wallet proof and a stored failure stay as they are.
export const isRetryableTipFailure = (verification: TipVerification | undefined): boolean =>
  verification?.status === 'failed' && !verification.stored && Boolean(verification.onChain || verification.rpcError);

// how long to wait before the chain is asked again: 15 seconds, doubled each time, up to 5 minutes
export const getTipRetryDelay = (attempt: number): number => Math.min(15_000 * 2 ** Math.max(0, attempt), 300_000);

// everything known about a failed tip, as text to paste into a report. It names no RPC url.
export const getTipErrorReport = ({ error, tip, offline, onChain, rpcError, stored }: TipVerificationFailure): string =>
  JSON.stringify(
    {
      error,
      tip: {
        chainId: tip.chainId,
        txHash: tip.txHash,
        type: tip.type,
        token: tip.token,
        from: tip.from,
        to: tip.to,
        amount: tip.amount?.toString(),
        tokenId: tip.tokenId,
      },
      checks: { ...offline, ...onChain },
      rpcError,
      storedResult: stored,
    },
    null,
    2,
  );
