import { useAccount } from '@bitsocial/bitsocial-react-hooks';
import type { Account, ChallengeVerification, Comment, PublishCommentOptions } from '@bitsocial/bitsocial-react-hooks';
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import {
  buildTipClaim,
  formatTokenAmount,
  getParentBindingSuffix,
  getRequiredFee,
  getTipAmountError,
  getTipClaimPublishOptions,
  getTipRecipientAddress,
} from '../lib/tipping';
import type { TipToken, TipTokenType, TippingConfig } from '../lib/tipping';
import { ensureRpcChainId, getBalance, getTokenInfo, sendTransfer, simulateTransfer, waitForTransaction } from '../lib/tipping-chain';
import { alertChallengeVerificationFailed } from '../lib/utils';
import { ensureInAppWallet, getInAppWallet } from './use-in-app-wallet';
import usePublishCommentWithAbandon from './use-publish-comment-with-abandon';
import { getTippingRpcUrl } from './use-tipping-settings';

const STORAGE_KEY = 'bitbonesPendingTips';

// The tip transfer itself, kept so a tip can still be sent after a reload once its fee is paid.
interface PendingTransfer {
  token: { chainId: number; type: TipTokenType; address?: string };
  to: string;
  // base units for native and erc20, the token id for erc721
  amountOrTokenId: string;
}

// A tip in progress, from its fee being sent to its reply being accepted. It is saved the moment
// a transfer has a hash, because from then on the money is gone and only the claim can be lost.
interface PendingTip {
  communityAddress: string;
  parentCid: string;
  postCid: string;
  content: string;
  chainId: number;
  transfer: PendingTransfer;
  // undefined until the tip is sent, which happens only after the fee is mined
  txHash?: string;
  // the fee owed, kept so it can still be paid after a reload; amount in base units
  fee?: { token?: string; amount: string; to: string };
  feeTxHash?: string;
}

const readStoredPendingTips = (): Record<string, PendingTip> => {
  try {
    const stored: Record<string, PendingTip> = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    // a record saved without a chain id names no chain, and one without its transfer is from before
    // transactions carried the parent binding: its claim can't be built or its tip sent
    return Object.fromEntries(
      Object.entries(stored && typeof stored === 'object' ? stored : {}).filter(([, pendingTip]) => typeof pendingTip?.chainId === 'number' && pendingTip.transfer),
    );
  } catch {
    return {};
  }
};

interface TipState {
  pendingTips: Record<string, PendingTip | undefined>;
  // what the tip of a parent comment is doing right now, while it is doing something
  status: Record<string, string | undefined>;
  error: Record<string, string | undefined>;
  // its transfers are mined, so its reply can be published
  mined: Record<string, boolean | undefined>;
  setPendingTip: (parentCid: string, pendingTip: PendingTip | undefined) => void;
}

const useTipStore = create<TipState>((setState, getState) => ({
  pendingTips: readStoredPendingTips(),
  status: {},
  error: {},
  mined: {},
  setPendingTip: (parentCid, pendingTip) => {
    setState((state) => ({ pendingTips: { ...state.pendingTips, [parentCid]: pendingTip } }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(getState().pendingTips));
    } catch {}
  },
}));

const setStatus = (parentCid: string, status: string | undefined) => useTipStore.setState((state) => ({ status: { ...state.status, [parentCid]: status } }));
const setError = (parentCid: string, error: string | undefined) => useTipStore.setState((state) => ({ error: { ...state.error, [parentCid]: error } }));

const getErrorMessage = (error: unknown): string => (error as { shortMessage?: string })?.shortMessage || (error instanceof Error ? error.message : String(error));

// runs one step of a tip at a time per parent comment, and reports how it ended
const run = async (parentCid: string, step: () => Promise<void>): Promise<void> => {
  if (useTipStore.getState().status[parentCid]) {
    return;
  }
  setError(parentCid, undefined);
  setStatus(parentCid, 'starting...');
  try {
    await step();
  } catch (error) {
    console.warn(error);
    setError(parentCid, getErrorMessage(error));
  } finally {
    setStatus(parentCid, undefined);
  }
};

// Pays the fee if one is owed and not paid yet, waits for it, then sends the tip and waits for that.
// The fee goes first: if it fails the tip has not been sent, and a failed fee can be sent again.
// Safe to run again after a reload: each transfer is sent only when none was recorded for it.
const settle = async (account: Account | undefined, parentCid: string): Promise<void> => {
  const { setPendingTip } = useTipStore.getState();
  let pendingTip = useTipStore.getState().pendingTips[parentCid];
  if (!pendingTip) {
    return;
  }
  const rpcUrl = getTippingRpcUrl(pendingTip.chainId, account?.chainProviders);
  if (!rpcUrl) {
    throw Error(`no RPC url for chain id ${pendingTip.chainId}, set one in settings`);
  }
  // the RPC may have been changed since the tip was started
  await ensureRpcChainId(rpcUrl, pendingTip.chainId);
  const inAppWallet = getInAppWallet(account);
  if (!inAppWallet) {
    throw Error('this account has no in-app wallet to pay from');
  }
  if (pendingTip.fee && !pendingTip.feeTxHash) {
    setStatus(parentCid, 'sending the community fee...');
    const feeTxHash = await sendTransfer({
      rpcUrl,
      privateKey: inAppWallet.privateKey,
      token: { chainId: pendingTip.chainId, type: pendingTip.fee.token ? 'erc20' : 'native', address: pendingTip.fee.token },
      to: pendingTip.fee.to,
      amountOrTokenId: BigInt(pendingTip.fee.amount),
      parentBinding: getParentBindingSuffix(parentCid),
    });
    pendingTip = { ...pendingTip, feeTxHash };
    setPendingTip(parentCid, pendingTip);
  }
  if (pendingTip.fee && pendingTip.feeTxHash) {
    setStatus(parentCid, 'waiting for the fee to be mined...');
    await waitForTransaction(
      rpcUrl,
      pendingTip.feeTxHash,
      pendingTip.fee.token ? { token: pendingTip.fee.token, to: pendingTip.fee.to, amount: BigInt(pendingTip.fee.amount) } : undefined,
    );
  }
  let txHash = pendingTip.txHash;
  if (!txHash) {
    setStatus(parentCid, 'sending the tip...');
    const { token, to, amountOrTokenId } = pendingTip.transfer;
    txHash = await sendTransfer({
      rpcUrl,
      privateKey: inAppWallet.privateKey,
      token,
      to,
      amountOrTokenId: BigInt(amountOrTokenId),
      parentBinding: getParentBindingSuffix(parentCid),
    });
    // `mined` belongs to the tip being sent. Left true from an earlier tip on this comment, it would
    // publish this tip's reply at once, before its transaction is mined, and the community would
    // answer "not mined yet".
    useTipStore.setState((state) => ({ mined: { ...state.mined, [parentCid]: false } }));
    pendingTip = { ...pendingTip, txHash };
    setPendingTip(parentCid, pendingTip);
  }
  setStatus(parentCid, 'waiting for the tip to be mined...');
  await waitForTransaction(rpcUrl, txHash);
  useTipStore.setState((state) => ({ mined: { ...state.mined, [parentCid]: true } }));
};

interface SendTipOptions {
  token: TipToken;
  // base units for native and erc20, the token id for erc721
  amountOrTokenId: bigint;
  content: string;
}

const formatAmount = (amount: bigint, decimals: number | undefined, symbol: string): string =>
  decimals === undefined ? `${amount} base units of ${symbol}` : `${formatTokenAmount(amount, decimals)} ${symbol}`;

const start = async (account: Account | undefined, comment: Comment, config: TippingConfig, { token, amountOrTokenId, content }: SendTipOptions): Promise<void> => {
  const parentCid: string = comment.cid;
  const { chainId } = token;
  if (token.type !== 'erc721') {
    const amountError = getTipAmountError(token, amountOrTokenId);
    if (amountError) {
      throw Error(amountError);
    }
  }
  const rpcUrl = getTippingRpcUrl(chainId, account?.chainProviders);
  if (!rpcUrl) {
    throw Error(`no RPC url for chain id ${chainId}, set one in settings`);
  }
  // before anything is read or sent: the RPC must be on the chain the token names
  setStatus(parentCid, 'checking the RPC...');
  await ensureRpcChainId(rpcUrl, chainId);

  // before paying an address, the proof that the author controls it is verified here. The author's
  // `eth` entry is paid if it verifies, otherwise their first proven entry by key.
  setStatus(parentCid, 'verifying the recipient wallet...');
  const to = await getTipRecipientAddress(comment);
  if (!to) {
    throw Error("can't tip this author: they have not published a wallet with a valid proof");
  }

  const inAppWallet = getInAppWallet(account);
  if (!inAppWallet) {
    throw Error('this account has no in-app wallet');
  }
  if (to.toLowerCase() === inAppWallet.address.toLowerCase()) {
    throw Error("can't tip yourself");
  }

  setStatus(parentCid, 'reading the chain...');
  const fee = token.type === 'erc721' ? getRequiredFee(config, token, 0n) : getRequiredFee(config, token, amountOrTokenId);
  const feeToken = fee ? { chainId, type: fee.token ? ('erc20' as const) : ('native' as const), address: fee.token } : undefined;
  const [tokenInfo, feeTokenInfo, balance, feeBalance] = await Promise.all([
    getTokenInfo(rpcUrl, token),
    feeToken ? getTokenInfo(rpcUrl, feeToken) : undefined,
    getBalance(rpcUrl, token, inAppWallet.address),
    feeToken ? getBalance(rpcUrl, feeToken, inAppWallet.address) : undefined,
  ]);
  if (token.type !== 'erc721') {
    // a percentage or flat fee on a fungible token is paid in that same token, on top of the tip
    const needed = amountOrTokenId + (fee?.amount ?? 0n);
    if (balance < needed) {
      throw Error(
        `the in-app wallet holds ${formatAmount(balance, tokenInfo.decimals, tokenInfo.symbol)}, this tip needs ${formatAmount(needed, tokenInfo.decimals, tokenInfo.symbol)}`,
      );
    }
  } else if (fee && feeTokenInfo && feeBalance !== undefined && feeBalance < fee.amount) {
    throw Error(
      `the in-app wallet holds ${formatAmount(feeBalance, feeTokenInfo.decimals, feeTokenInfo.symbol)}, the fee is ${formatAmount(fee.amount, feeTokenInfo.decimals, feeTokenInfo.symbol)}`,
    );
  }

  const tipText = token.type === 'erc721' ? `${tokenInfo.symbol} #${amountOrTokenId}` : formatAmount(amountOrTokenId, tokenInfo.decimals, tokenInfo.symbol);
  const feeText =
    fee && feeTokenInfo ? `\nplus a community fee of ${formatAmount(fee.amount, feeTokenInfo.decimals, feeTokenInfo.symbol)} to ${config.feeRecipient}` : '';
  // Both transactions are simulated before either is sent, with the parent binding in place: a
  // receiver with code, or a token contract that rejects trailing calldata, makes one revert, and
  // this shows it before any money moves. Each simulation runs against the balance as it is now, so
  // the native coin needed for both, with their gas, is checked together below.
  setStatus(parentCid, 'simulating the transactions...');
  const parentBinding = getParentBindingSuffix(parentCid);
  const tipTransfer = { rpcUrl, privateKey: inAppWallet.privateKey, token, to, amountOrTokenId, parentBinding };
  const feeTransfer =
    fee && feeToken && config.feeRecipient
      ? { rpcUrl, privateKey: inAppWallet.privateKey, token: feeToken, to: config.feeRecipient, amountOrTokenId: fee.amount, parentBinding }
      : undefined;
  const [tipSimulation, feeSimulation] = await Promise.all([simulateTransfer(tipTransfer), feeTransfer ? simulateTransfer(feeTransfer) : undefined]);
  const nativeToken = { chainId, type: 'native' as const };
  const nativeBalance = token.type === 'native' ? balance : await getBalance(rpcUrl, nativeToken, inAppWallet.address);
  const gasCost = tipSimulation.gas * tipSimulation.gasPrice + (feeSimulation ? feeSimulation.gas * feeSimulation.gasPrice : 0n);
  const nativeNeeded = gasCost + (token.type === 'native' ? amountOrTokenId : 0n) + (fee && !fee.token ? fee.amount : 0n);
  if (nativeBalance < nativeNeeded) {
    const nativeInfo = await getTokenInfo(rpcUrl, nativeToken);
    throw Error(
      `the in-app wallet holds ${formatAmount(nativeBalance, nativeInfo.decimals, nativeInfo.symbol)}, the transfers and the gas of both need about ${formatAmount(nativeNeeded, nativeInfo.decimals, nativeInfo.symbol)}`,
    );
  }

  const confirmed = window.confirm(
    `send ${tipText} to ${to}${feeText}\n\non chain id ${chainId} (${rpcUrl})\nfrom the in-app wallet ${inAppWallet.address}\n\nthis moves real funds and can't be undone.`,
  );
  if (!confirmed) {
    return;
  }

  // the tip's sender must be a wallet this account has proven
  setStatus(parentCid, 'linking the in-app wallet...');
  await ensureInAppWallet(account);

  useTipStore.getState().setPendingTip(parentCid, {
    communityAddress: comment.communityAddress,
    parentCid,
    postCid: comment.postCid || parentCid,
    content: content.trim() || 'tip',
    chainId,
    transfer: { token: { chainId, type: token.type, address: token.address }, to, amountOrTokenId: String(amountOrTokenId) },
    fee: fee && config.feeRecipient ? { token: fee.token, amount: String(fee.amount), to: config.feeRecipient } : undefined,
  });
  await settle(account, parentCid);
};

// a tip's reply is published once on its own; after a failed publish it is the user's call
const publishedTxHashes = new Set<string>();

interface UseTipResult {
  pendingTip: PendingTip | undefined;
  status: string | undefined;
  error: string | undefined;
  // the transfers are mined and the reply is being, or can be, published
  mined: boolean;
  sendTip: (options: SendTipOptions) => Promise<void>;
  // picks a tip up again after a reload or a failure: waits, pays an unpaid fee, publishes the reply
  resumeTip: () => Promise<void>;
  // forgets the claim. The transfer itself can't be taken back.
  discardTip: () => void;
}

// Tipping the author of a comment: transfer, optional fee transfer, then a reply that claims them.
const useTip = (comment: Comment | undefined, config: TippingConfig | undefined): UseTipResult => {
  const account = useAccount();
  const parentCid: string | undefined = comment?.cid;
  const pendingTip = useTipStore((state) => (parentCid ? state.pendingTips[parentCid] : undefined));
  const status = useTipStore((state) => (parentCid ? state.status[parentCid] : undefined));
  const error = useTipStore((state) => (parentCid ? state.error[parentCid] : undefined));
  const mined = useTipStore((state) => Boolean(parentCid && state.mined[parentCid]));

  const publishCommentOptions = useMemo((): PublishCommentOptions | undefined => {
    // the challenge index comes from the community's current challenges, so a tip resumed after a
    // reload waits for the community to load instead of guessing the key
    if (!pendingTip?.txHash || !mined || !config) {
      return undefined;
    }
    const { parentCid, txHash } = pendingTip;
    return {
      communityAddress: pendingTip.communityAddress,
      parentCid,
      postCid: pendingTip.postCid,
      content: pendingTip.content,
      ...getTipClaimPublishOptions(buildTipClaim(pendingTip.chainId, txHash, pendingTip.feeTxHash), config.challengeIndex),
      onChallengeVerification: (challengeVerification: ChallengeVerification, publication?: Comment) => {
        if (challengeVerification?.challengeSuccess === true) {
          // accepted: the claim is published, nothing is left to lose. A newer tip on the same
          // comment keeps its own record.
          if (useTipStore.getState().pendingTips[parentCid]?.txHash === txHash) {
            useTipStore.getState().setPendingTip(parentCid, undefined);
          }
        } else {
          setError(parentCid, 'the community did not accept the tip reply. The transfer stays valid, so the reply can be published again.');
        }
        alertChallengeVerificationFailed(challengeVerification, publication);
      },
      onError: (error: Error) => {
        console.warn(error);
        setError(parentCid, getErrorMessage(error));
      },
    };
  }, [pendingTip, mined, config]);

  const { publishComment } = usePublishCommentWithAbandon(publishCommentOptions, comment);

  // Publishing is an effect and not the end of the click handler because the publish function only
  // exists for options from a previous render, and the claim in those options is known only once
  // the transfers are mined. It also lets a tip that was mined while this comment was off screen
  // publish when the comment is shown again.
  const txHash = publishCommentOptions ? pendingTip?.txHash : undefined;
  useEffect(() => {
    if (!txHash || publishedTxHashes.has(txHash)) {
      return;
    }
    publishedTxHashes.add(txHash);
    publishComment().catch((error: unknown) => {
      console.warn(error);
      if (parentCid) {
        setError(parentCid, getErrorMessage(error));
      }
    });
  }, [txHash, publishComment, parentCid]);

  return {
    pendingTip,
    status,
    error,
    mined,
    sendTip: async (options) => {
      if (comment?.cid && config) {
        await run(comment.cid, () => start(account, comment, config, options));
      }
    },
    resumeTip: async () => {
      if (!parentCid) {
        return;
      }
      if (publishCommentOptions) {
        setError(parentCid, undefined);
        await publishComment().catch((error: unknown) => setError(parentCid, getErrorMessage(error)));
      } else {
        await run(parentCid, () => settle(account, parentCid));
      }
    },
    discardTip: () => {
      if (parentCid) {
        useTipStore.getState().setPendingTip(parentCid, undefined);
        useTipStore.setState((state) => ({ mined: { ...state.mined, [parentCid]: false }, error: { ...state.error, [parentCid]: undefined } }));
      }
    },
  };
};

// cheap enough for every comment in a thread: one store read, no publish machinery
export const useHasPendingTip = (parentCid: string | undefined): boolean => useTipStore((state) => Boolean(parentCid && state.pendingTips[parentCid]));

export default useTip;
