import { useAccount } from '@bitsocial/bitsocial-react-hooks';
import type { Comment, Community } from '@bitsocial/bitsocial-react-hooks';
import { create } from 'zustand';
import { getParentBindingSuffix, getProvenWalletAddresses, getTip, getTipCheck, getTipCheckError, getTipReplies, getVerifiedTipKey, sumTips } from '../lib/tipping';
import type { TipTotal } from '../lib/tipping';
import '../lib/tipping-comment';
import { checkTipOnChain } from '../lib/tipping-chain';
import { getTipResultKey, verifyCheckedTip, writeStoredTipResult } from '../lib/tipping-verification';
import type { TipVerification } from '../lib/tipping-verification';
import useTippingSettingsStore, { getTippingRpcUrl, useTippingRpcUrl } from './use-tipping-settings';

interface TipRecheckState {
  // how many times a tip's check was asked for again, by its result key
  attempts: Record<string, number>;
  recheck: (resultKey: string) => void;
}

const useTipRecheckStore = create<TipRecheckState>((setState, getState) => ({
  attempts: {},
  recheck: (resultKey) => {
    // a stored failure is forgotten, so the chain is asked again
    writeStoredTipResult(resultKey, undefined);
    setState({ attempts: { ...getState().attempts, [resultKey]: (getState().attempts[resultKey] ?? 0) + 1 } });
  },
}));

// asks the chain about a tip again, replacing what was found before
export const recheckTip = (resultKey: string) => useTipRecheckStore.getState().recheck(resultKey);

const cacheLimit = 2000;
const verifications = new Map<string, Promise<TipVerification | undefined>>();
const totals = new Map<string, Promise<TipTotal[]>>();
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

// The verification of the tip a reply carries, with its promise kept per input so a component can
// read it with React's use(). Undefined when the reply carries no tip this client reads. A check
// that failed stays for the session, until it is rechecked or another RPC url is set.
const getVerificationEntry = (
  reply: Comment | undefined,
  parent: Comment | undefined,
  community: Community | undefined,
  rpcUrl: string | undefined,
  attempt: number,
): { key: string; verification: Promise<TipVerification | undefined> } | undefined => {
  const inputKey = getTip(reply) && reply && parent ? getVerifiedTipKey(reply, parent, community) : undefined;
  if (!inputKey || !reply || !parent) {
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
            ? verifyCheckedTip({ check, offlineError: getTipCheckError(check), replyCid: String(reply.cid), parentCid: String(parent.cid), rpcUrl }, async (rpcUrl) =>
                // the transaction has to be sent by one of the tipper's proven wallets, and end with the binding of the tipped comment
                checkTipOnChain(rpcUrl, check.tip, await getProvenWalletAddresses(reply, undefined, community), getParentBindingSuffix(String(parent.cid))),
              )
            : undefined,
        )
        // there is no error boundary: a tip that could not be checked is one that is not shown
        .catch(() => undefined),
    );
  return { key, verification };
};

// Whether the tip a reply carries is shown: its wallet proofs verify and its transaction is the one
// it claims, as looked up on its chain or as stored from an earlier lookup.
export const useTipVerification = (reply: Comment | undefined, parent: Comment | undefined, community?: Community): Promise<TipVerification | undefined> => {
  const rpcUrl = useTippingRpcUrl(getTip(reply)?.chainId);
  const resultKey = getResultKey(reply, parent);
  const attempt = useTipRecheckStore((state) => (resultKey ? (state.attempts[resultKey] ?? 0) : 0));
  return getVerificationEntry(reply, parent, community, rpcUrl, attempt)?.verification ?? noVerification;
};

// What a comment was tipped: the verified tips on its loaded replies, summed per chain and token. A
// community cannot write to the tipped comment's own update, so this is the only total there is, and
// it covers only the replies the client has loaded.
export const useVerifiedTipTotals = (parent: Comment | undefined, replies: (Comment | undefined)[] | undefined, community?: Community): Promise<TipTotal[]> => {
  const chainProviders = useAccount()?.chainProviders;
  // a tip can be on any chain, so any RPC url that is set or any recheck reads the totals again
  const rpcUrlOverrides = useTippingSettingsStore((state) => state.rpcUrls);
  const attempts = useTipRecheckStore((state) => state.attempts);
  const entries = getTipReplies(parent, replies).flatMap((reply) => {
    const rpcUrl = rpcUrlOverrides[String(getTip(reply)?.chainId)] || getTippingRpcUrl(getTip(reply)?.chainId, chainProviders);
    return getVerificationEntry(reply, parent, community, rpcUrl, attempts[getResultKey(reply, parent) ?? ''] ?? 0) ?? [];
  });
  if (!entries.length) {
    return noTotals;
  }
  const key = entries.map((entry) => entry.key).join('\n\n');
  return (
    totals.get(key) ??
    remember(
      totals,
      key,
      Promise.all(entries.map((entry) => entry.verification)).then((verifications) =>
        sumTips(verifications.flatMap((verification) => (verification?.status === 'verified' ? [verification.tip] : []))),
      ),
    )
  );
};
