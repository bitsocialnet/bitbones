import { useDeferredValue } from 'react';
import { useAccount } from '@bitsocial/bitsocial-react-hooks';
import type { Comment, Community } from '@bitsocial/bitsocial-react-hooks';
import { create } from 'zustand';
import {
  getParentBindingSuffix,
  getProvenWalletAddresses,
  getTip,
  getTipCheck,
  getTipCheckError,
  getEarlierTipClaims,
  getTipReplies,
  getVerifiedTipKey,
  sumTips,
} from '../lib/tipping';
import type { TipTotal } from '../lib/tipping';
import '../lib/tipping-comment';
import { checkTipOnChain } from '../lib/tipping-chain';
import type { OnChainTipResult } from '../lib/tipping-chain';
import { getTipResultKey, getTipRetryDelay, isRetryableTipFailure, rankTipVerification, verifyCheckedTip, writeStoredTipResult } from '../lib/tipping-verification';
import type { TipVerification } from '../lib/tipping-verification';
import useTippingSettingsStore, { getTippingRpcUrl, useTippingRpcUrl } from './use-tipping-settings';

interface TipRecheckState {
  // how many times a tip's check was asked for again, by its result key
  attempts: Record<string, number>;
  recheck: (resultKey: string) => void;
  retry: (resultKey: string, attempt: number) => void;
}

const useTipRecheckStore = create<TipRecheckState>((setState, getState) => ({
  attempts: {},
  recheck: (resultKey) => {
    // a stored failure is forgotten, so the chain is asked again
    writeStoredTipResult(resultKey, undefined);
    setState({ attempts: { ...getState().attempts, [resultKey]: (getState().attempts[resultKey] ?? 0) + 1 } });
  },
  // the automatic retry of one attempt: it does nothing once that attempt was already replaced
  retry: (resultKey, attempt) => {
    if ((getState().attempts[resultKey] ?? 0) === attempt) {
      setState({ attempts: { ...getState().attempts, [resultKey]: attempt + 1 } });
    }
  },
}));

// asks the chain about a tip again, replacing what was found before
export const recheckTip = (resultKey: string) => useTipRecheckStore.getState().recheck(resultKey);

const cacheLimit = 2000;
const verifications = new Map<string, Promise<TipVerification | undefined>>();
const lookups = new Map<string, Promise<OnChainTipResult>>();
const ranked = new Map<string, Promise<TipVerification | undefined>>();
const totals = new Map<string, Promise<TipTotal[]>>();
const scheduledRetries = new Set<string>();
interface VerificationEntry {
  key: string;
  verification: Promise<TipVerification | undefined>;
}

const noVerification: Promise<TipVerification | undefined> = Promise.resolve(undefined);
const noTotals: Promise<TipTotal[]> = Promise.resolve([]);

const remember = <Value>(cache: Map<string, Value>, key: string, value: Value): Value => {
  if (cache.size >= cacheLimit) {
    cache.clear();
  }
  cache.set(key, value);
  return value;
};

const getResultKey = (reply: Comment | undefined, parent: Comment | undefined): string | undefined => {
  const tip = getTip(reply);
  return tip && typeof reply?.cid === 'string' && typeof parent?.cid === 'string' ? getTipResultKey(tip, reply.cid, parent.cid) : undefined;
};

// A failure that is not final is asked of the chain again after a wait that doubles each time. The
// retry only counts the attempt up: the chain is asked when a component that shows the tip renders
// again, so a tip that is no longer on screen stops being asked about.
const scheduleRetry = (resultKey: string, attempt: number) => {
  const key = `${resultKey}\n${attempt}`;
  if (scheduledRetries.has(key)) {
    return;
  }
  if (scheduledRetries.size >= cacheLimit) {
    scheduledRetries.clear();
  }
  scheduledRetries.add(key);
  setTimeout(() => useTipRecheckStore.getState().retry(resultKey, attempt), getTipRetryDelay(attempt));
};

// The verification of the tip a reply carries on its own, whatever other replies claim, with its
// promise kept per input. Undefined when the reply carries no tip this client reads.
const getVerificationEntry = (
  reply: Comment | undefined,
  parent: Comment | undefined,
  community: Community | undefined,
  rpcUrl: string | undefined,
  attempt: number,
): VerificationEntry | undefined => {
  const inputKey = getTip(reply) && reply && parent ? getVerifiedTipKey(reply, parent, community) : undefined;
  const resultKey = getResultKey(reply, parent);
  if (!inputKey || !resultKey || !reply || !parent) {
    return undefined;
  }
  const key = `${inputKey}\n${rpcUrl ?? ''}\n${attempt}`;
  const verification =
    verifications.get(key) ??
    remember(
      verifications,
      key,
      getTipCheck(reply, parent, community)
        .then((check) =>
          check
            ? verifyCheckedTip(
                { check, offlineError: getTipCheckError(check), replyCid: String(reply.cid), parentCid: String(parent.cid), rpcUrl },
                async (rpcUrl, tip) => {
                  // the transaction has to be sent by one of the tipper's proven wallets, and end with the binding of the tipped comment
                  const senders = await getProvenWalletAddresses(reply, undefined, community);
                  // The lookup on the chain is kept apart from the wallet-proof check: by the tip and the
                  // wallets it was checked against. Every vote or reply re-signs a comment's update, which
                  // changes the input of the offline check and not the transaction, so it must not ask the
                  // chain again.
                  const lookupKey = [resultKey, rpcUrl, attempt, ...senders.map((sender) => sender.toLowerCase()).sort()].join('\n');
                  return lookups.get(lookupKey) ?? remember(lookups, lookupKey, checkTipOnChain(rpcUrl, tip, senders, getParentBindingSuffix(String(parent.cid))));
                },
              )
            : undefined,
        )
        .then((verification) => {
          if (isRetryableTipFailure(verification)) {
            scheduleRetry(resultKey, attempt);
          }
          return verification;
        })
        // there is no error boundary: a tip that could not be checked is one that is not shown
        .catch(() => undefined),
    );
  return { key, verification };
};

// The verification of a reply's tip among the earlier replies that claim the same transaction: a
// repeat once one of those verifies. Each of them is verified on its own, against the same comment.
const getRankedEntry = (
  reply: Comment | undefined,
  earlierClaims: Comment[] | undefined,
  parent: Comment | undefined,
  community: Community | undefined,
  rpcUrl: string | undefined,
  getAttempt: (resultKey: string | undefined) => number,
): VerificationEntry | undefined => {
  const getEntry = (claim: Comment | undefined) => getVerificationEntry(claim, parent, community, rpcUrl, getAttempt(getResultKey(claim, parent)));
  const own = getEntry(reply);
  const earlier = (earlierClaims ?? []).flatMap((claim) => getEntry(claim) ?? []);
  if (!own || !earlier.length) {
    return own;
  }
  const key = [own.key, ...earlier.map((entry) => entry.key)].join('\n\n');
  const verification =
    ranked.get(key) ??
    remember(
      ranked,
      key,
      Promise.all([own.verification, ...earlier.map((entry) => entry.verification)]).then(([verification, ...earlierVerifications]) =>
        rankTipVerification(verification, earlierVerifications),
      ),
    );
  return { key, verification };
};

// Whether the tip a reply carries is shown: its wallet proofs verify, its transaction is the one it
// claims, as looked up on its chain or as stored from an earlier lookup, and no earlier reply holds
// the same transaction (`earlierClaims`, from getTipRivals). The promise is deferred: while a newer
// check runs, after a retry or an update of either comment, the last answer stays on screen instead
// of the Suspense fallback.
export const useTipVerification = (
  reply: Comment | undefined,
  parent: Comment | undefined,
  community?: Community,
  earlierClaims?: Comment[],
): Promise<TipVerification | undefined> => {
  // the earlier claims name the same transaction, so they are on the same chain
  const rpcUrl = useTippingRpcUrl(getTip(reply)?.chainId);
  const resultKeys = [reply, ...(earlierClaims ?? [])].map((claim) => getResultKey(claim, parent));
  // one string, so a recheck of any of them reads the verification again and nothing else does
  const attempts = useTipRecheckStore((state) => resultKeys.map((resultKey) => (resultKey ? (state.attempts[resultKey] ?? 0) : 0)).join(','))
    .split(',')
    .map(Number);
  const getAttempt = (resultKey: string | undefined) => attempts[resultKeys.indexOf(resultKey)] ?? 0;
  return useDeferredValue(getRankedEntry(reply, earlierClaims, parent, community, rpcUrl, getAttempt)?.verification ?? noVerification);
};

// What a comment was tipped: the verified tips on its loaded replies, summed per chain and token. A
// community cannot write to the tipped comment's own update, so this is the only total there is, and
// it covers only the replies the client has loaded. A transaction that several replies claim is
// counted once.
export const useVerifiedTipTotals = (parent: Comment | undefined, replies: (Comment | undefined)[] | undefined, community?: Community): Promise<TipTotal[]> => {
  const chainProviders = useAccount()?.chainProviders;
  // a tip can be on any chain, so any RPC url that is set or any recheck reads the totals again
  const rpcUrlOverrides = useTippingSettingsStore((state) => state.rpcUrls);
  const attempts = useTipRecheckStore((state) => state.attempts);
  const earlierClaims = getEarlierTipClaims(replies);
  const entries = getTipReplies(parent, replies).flatMap((reply) => {
    const rpcUrl = rpcUrlOverrides[String(getTip(reply)?.chainId)] || getTippingRpcUrl(getTip(reply)?.chainId, chainProviders);
    return getRankedEntry(reply, earlierClaims.get(String(reply.cid)), parent, community, rpcUrl, (resultKey) => attempts[resultKey ?? ''] ?? 0) ?? [];
  });
  const key = entries.map((entry) => entry.key).join('\n\n\n');
  return useDeferredValue(
    entries.length
      ? (totals.get(key) ??
          remember(
            totals,
            key,
            Promise.all(entries.map((entry) => entry.verification)).then((verifications) =>
              sumTips(verifications.flatMap((verification) => (verification?.status === 'verified' ? [verification.tip] : []))),
            ),
          ))
      : noTotals,
  );
};
