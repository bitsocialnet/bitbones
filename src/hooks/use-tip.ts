import { useAccount } from '@bitsocial/bitsocial-react-hooks';
import type { Account, ChallengeVerification, Comment, PublishCommentOptions } from '@bitsocial/bitsocial-react-hooks';
import { useEffect, useMemo } from 'react';
import type { Hash, Hex } from 'viem';
import { create } from 'zustand';
import {
  buildTipClaim,
  formatTokenAmount,
  getParentBindingSuffix,
  getRequiredFee,
  getTipAmountError,
  getTipClaimPublishOptions,
  getFlowAfterStorageChange,
  getKeyAddressFromPublicKey,
  getPartyKeyAddress,
  getProvenWalletAddresses,
  getTipRecipientAddress,
  getTipSendPlan,
  getTipSettleOutcome,
  writePendingTip,
} from '../lib/tipping';
import type { TipToken, TipTokenType, TippingConfig, TransferWait } from '../lib/tipping';
import {
  ensureBroadcast,
  ensureRpcChainId,
  getBalance,
  getPendingNonce,
  getSignedNonce,
  getTokenInfo,
  isTransactionKnown,
  isTransferDead,
  signTransfer,
  simulateTransfer,
  TransferFailedError,
  waitForTransaction,
} from '../lib/tipping-chain';
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
  // the account that started the tip: its in-app wallet sent the transfers and its author publishes the claim
  accountId?: string;
  communityAddress: string;
  parentCid: string;
  postCid: string;
  content: string;
  chainId: number;
  transfer: PendingTransfer;
  // undefined until the tip is sent, right after the fee
  txHash?: string;
  // the fee owed, kept so it can still be paid after a reload; amount in base units
  fee?: { token?: string; amount: string; to: string };
  feeTxHash?: string;
  // The signed transactions behind the hashes, saved before they are broadcast so that a broadcast
  // whose response was lost is sent again instead of signed anew. Records from before have none.
  txRaw?: string;
  feeRaw?: string;
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
  // its tip is mined but its fee reverted, so the fee can be sent again
  feeFailed: Record<string, boolean | undefined>;
  // its reply was accepted but its record could not be deleted: publishing it again would send a second reply
  accepted: Record<string, boolean | undefined>;
  // false when the browser would not save it, which a transfer must not be sent after
  setPendingTip: (parentCid: string, pendingTip: PendingTip | undefined) => boolean;
}

const useTipStore = create<TipState>((setState, getState) => ({
  pendingTips: readStoredPendingTips(),
  status: {},
  error: {},
  mined: {},
  feeFailed: {},
  accepted: {},
  setPendingTip: (parentCid, pendingTip) => {
    // Merged into what is stored now and not written from this tab's map: another tab may have
    // saved or cleared a tip on another comment since this one loaded, and a recovery record lost
    // after the money has moved can't be rebuilt.
    const { pendingTips, saved } = writePendingTip(localStorage, STORAGE_KEY, getState().pendingTips, readStoredPendingTips(), parentCid, pendingTip);
    if (saved) {
      setState({ pendingTips });
    }
    return saved;
  },
}));

// the tips another tab saved or cleared
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      useTipStore.setState((state) => getFlowAfterStorageChange(state, readStoredPendingTips()));
    }
  });
}

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

// where a pending tip is sent from: the RPC it names, on the chain it names, and the in-app wallet
const getSender = async (account: Account | undefined, pendingTip: PendingTip) => {
  // another account would send the rest from its own wallet, and its fee and tip would not match
  if (pendingTip.accountId && pendingTip.accountId !== account?.id) {
    throw Error('this tip was started by another account, switch back to it to continue');
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
  return { rpcUrl, privateKey: inAppWallet.privateKey, address: inAppWallet.address };
};

const getFeeTransfer = (pendingTip: PendingTip, fee: NonNullable<PendingTip['fee']>) => ({
  token: { chainId: pendingTip.chainId, type: fee.token ? ('erc20' as const) : ('native' as const), address: fee.token },
  to: fee.to,
  amountOrTokenId: BigInt(fee.amount),
});

// an ERC-20 that returns false instead of reverting would leave a successful receipt and no tokens moved
const getExpectedTipTransfer = ({ transfer }: PendingTip) =>
  transfer.token.type === 'erc20' && transfer.token.address ? { token: transfer.token.address, to: transfer.to, amount: BigInt(transfer.amountOrTokenId) } : undefined;

// Where the next transaction of a sender goes: after every transaction the RPC counts as pending, and
// after those saved here that the RPC has seen, which may be from another tab. The RPC's pending count can
// lag behind a transaction broadcast seconds ago (a public RPC answers from several nodes), and a second
// transaction at the same nonce is refused or replaces the first. A saved transaction the RPC has never
// seen is not counted: nothing holds its nonce, and a later tip signed after it could not be mined until
// it was sent. It is dropped as dead once another transaction takes its nonce. An answer that can't be read
// counts it, which at worst leaves a gap that continuing the earlier tip fills.
const getNextNonce = async (rpcUrl: string, address: string, pendingTip: PendingTip): Promise<number> => {
  const saved = Object.values(readStoredPendingTips()).flatMap((other) =>
    pendingTip.accountId && other.accountId === pendingTip.accountId && other.chainId === pendingTip.chainId
      ? [
          { hash: other.feeTxHash, raw: other.feeRaw },
          { hash: other.txHash, raw: other.txRaw },
        ]
      : [],
  );
  const seen = await Promise.all(
    saved.map(async ({ hash, raw }) => (hash && raw && (await isTransactionKnown(rpcUrl, hash).catch(() => true)) ? getSignedNonce(raw) + 1 : 0)),
  );
  return Math.max(await getPendingNonce(rpcUrl, address), ...seen);
};

const setMined = (parentCid: string, mined: boolean) => useTipStore.setState((state) => ({ mined: { ...state.mined, [parentCid]: mined } }));
const setFeeFailed = (parentCid: string, feeFailed: boolean) => useTipStore.setState((state) => ({ feeFailed: { ...state.feeFailed, [parentCid]: feeFailed } }));

// The end of a wait as a value, so the fee's and the tip's can be told apart when both are waited for.
// Only a transaction that was mined and failed is a failure: a timeout or an RPC error rejects, so the
// tip stays resumable and no second fee is offered while the first may still be mined.
const toTransferWait = (wait: Promise<void>): Promise<TransferWait> =>
  wait.then<TransferWait, TransferWait>(
    () => ({ ok: true }),
    (error: unknown): TransferWait => {
      if (error instanceof TransferFailedError) {
        return { ok: false, error: error.message };
      }
      throw error;
    },
  );

// One send at a time: two tips on different comments would read the same pending nonce and replace
// each other. Held only while transactions are broadcast, never while waiting for them to be mined.
let sendQueue: Promise<unknown> = Promise.resolve();
const withSendLock = <T>(task: () => Promise<T>): Promise<T> => {
  const result = sendQueue.then(task, task);
  sendQueue = result.catch(() => undefined);
  return result;
};

// Sends what is not sent yet, the fee first and the tip right behind it, then waits once for both.
// The tip is not held back until the fee is mined: the fee has the lower nonce, so it is mined first
// or in the same block, and a fee that fails anyway can be sent again (resendFee) before the reply.
// Safe to run again after a reload: each transfer is sent only when none was recorded for it.
const settle = async (account: Account | undefined, parentCid: string): Promise<void> => {
  const { setPendingTip } = useTipStore.getState();
  const storedPendingTip = useTipStore.getState().pendingTips[parentCid];
  if (!storedPendingTip) {
    return;
  }
  // updated as the transfers get their hashes, which a closure can't narrow
  let pendingTip: PendingTip = storedPendingTip;
  const { rpcUrl, privateKey, address } = await getSender(account, pendingTip);
  const parentBinding = getParentBindingSuffix(parentCid);
  setFeeFailed(parentCid, false);

  const { sendFee, sendTip } = getTipSendPlan(pendingTip);
  setStatus(
    parentCid,
    sendFee || sendTip
      ? sendFee && sendTip
        ? 'sending the fee and the tip...'
        : sendFee
          ? 'sending the community fee...'
          : 'sending the tip...'
      : 'checking that the transactions were sent...',
  );
  await withSendLock(async () => {
    if (sendFee || sendTip) {
      // Both are signed before either is saved or sent, so a signing failure leaves nothing behind. The
      // nonce is read once and counted up by hand: the RPC's pending count can lag behind a transaction just sent.
      let nonce = await getNextNonce(rpcUrl, address, pendingTip);
      const feeSigned =
        sendFee && pendingTip.fee ? await signTransfer({ rpcUrl, privateKey, ...getFeeTransfer(pendingTip, pendingTip.fee), parentBinding, nonce: nonce++ }) : undefined;
      const { token, to, amountOrTokenId } = pendingTip.transfer;
      const tipSigned = sendTip ? await signTransfer({ rpcUrl, privateKey, token, to, amountOrTokenId: BigInt(amountOrTokenId), parentBinding, nonce }) : undefined;
      // `mined` belongs to the tip being sent. Left true from an earlier tip on this comment, it would
      // publish this tip's reply at once, before its transaction is mined, and the community would
      // answer "not mined yet".
      if (tipSigned) {
        setMined(parentCid, false);
      }
      // the hashes are saved before the first broadcast: from then on the money may be gone
      pendingTip = {
        ...pendingTip,
        ...(feeSigned && { feeTxHash: feeSigned.hash, feeRaw: feeSigned.raw }),
        ...(tipSigned && { txHash: tipSigned.hash, txRaw: tipSigned.raw }),
      };
      if (!setPendingTip(parentCid, pendingTip)) {
        throw Error("the tip could not be saved in this browser's storage, so nothing was sent");
      }
    }
    // The fee first, so it is the one in front in the queue. This is also what a resume does for a
    // transaction that was saved but is not known to the RPC.
    let step: 'fee' | 'tip' = 'fee';
    try {
      if (pendingTip.feeTxHash && pendingTip.feeRaw) {
        await ensureBroadcast(rpcUrl, { hash: pendingTip.feeTxHash as Hash, raw: pendingTip.feeRaw as Hex });
      }
      step = 'tip';
      if (pendingTip.txHash && pendingTip.txRaw) {
        await ensureBroadcast(rpcUrl, { hash: pendingTip.txHash as Hash, raw: pendingTip.txRaw as Hex });
      }
    } catch (error) {
      // The RPC's error, or none, does not say the transaction was not taken: only a nonce another
      // transaction used does. Otherwise what was signed stays, and the next try sends the same transaction.
      const failed = step === 'fee' ? { hash: pendingTip.feeTxHash, raw: pendingTip.feeRaw } : { hash: pendingTip.txHash, raw: pendingTip.txRaw };
      if (failed.hash && failed.raw && (await isTransferDead(rpcUrl, { hash: failed.hash as Hash, raw: failed.raw as Hex }, address))) {
        // It can never be mined: forget it, and the tip signed behind a fee unless that went out, and the
        // next try signs again at a fresh nonce.
        const { feeTxHash, feeRaw, txHash, txRaw, ...rest } = pendingTip;
        const tipSent = step === 'fee' && txHash && txRaw ? await isTransactionKnown(rpcUrl, txHash) : false;
        const keepTip = step === 'fee' && tipSent ? { txHash, txRaw } : {};
        const keepFee = step === 'tip' ? { feeTxHash, feeRaw } : {};
        setPendingTip(parentCid, { ...rest, ...keepFee, ...keepTip });
        throw Error(`the ${step} transaction can never be mined, another transaction took its nonce. It was dropped: continue to send it again.`);
      }
      throw error;
    }
  });

  const { fee, feeTxHash, txHash } = pendingTip;
  if (!txHash) {
    return;
  }
  setStatus(parentCid, feeTxHash ? 'waiting for the fee and the tip to be mined...' : 'waiting for the tip to be mined...');
  const [tipWait, feeWait] = await Promise.all([
    toTransferWait(waitForTransaction(rpcUrl, txHash, getExpectedTipTransfer(pendingTip))),
    fee && feeTxHash
      ? toTransferWait(waitForTransaction(rpcUrl, feeTxHash, fee.token ? { token: fee.token, to: fee.to, amount: BigInt(fee.amount) } : undefined))
      : undefined,
  ]);
  const outcome = getTipSettleOutcome(tipWait, feeWait);
  if (outcome.type === 'tip-failed') {
    throw Error(`the tip transaction failed (${outcome.error}), so there is nothing to claim. Forget this tip.`);
  }
  if (outcome.type === 'fee-failed') {
    setFeeFailed(parentCid, true);
    throw Error(`the fee transaction failed (${outcome.error}). The tip was sent, send the fee again to claim it.`);
  }
  setMined(parentCid, true);
};

// A tip whose fee failed after the tip was sent: pays the same fee again, to the same recipient and
// with the same parent binding, records its hash in place of the failed one, and carries on.
const resendFee = async (account: Account | undefined, parentCid: string): Promise<void> => {
  const pendingTip = useTipStore.getState().pendingTips[parentCid];
  if (!pendingTip?.fee || !pendingTip.txHash) {
    return;
  }
  const { rpcUrl, privateKey, address } = await getSender(account, pendingTip);
  const { fee } = pendingTip;
  setStatus(parentCid, 'sending the fee again...');
  await withSendLock(async () => {
    const signed = await signTransfer({
      rpcUrl,
      privateKey,
      ...getFeeTransfer(pendingTip, fee),
      parentBinding: getParentBindingSuffix(parentCid),
      nonce: await getNextNonce(rpcUrl, address, pendingTip),
    });
    setMined(parentCid, false);
    if (!useTipStore.getState().setPendingTip(parentCid, { ...pendingTip, feeTxHash: signed.hash, feeRaw: signed.raw })) {
      throw Error("the fee could not be saved in this browser's storage, so nothing was sent");
    }
    // the failed fee is replaced: if the replacement's broadcast fails or its answer is lost, what is
    // offered is to continue with it, not to pay a third fee
    setFeeFailed(parentCid, false);
    await ensureBroadcast(rpcUrl, signed);
  });
  await settle(account, parentCid);
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
  // not a wallet the tipper has proven as well: tipping/v1 rejects a tip a tipper sends to themselves
  const tipperAddresses = await getProvenWalletAddresses({ author: account?.author, signature: { publicKey: account?.signer?.publicKey } });
  const to = await getTipRecipientAddress(comment, undefined, tipperAddresses);
  if (!to) {
    throw Error("can't tip this author: they have not published a wallet with a valid proof that is not also yours");
  }

  const inAppWallet = getInAppWallet(account);
  if (!inAppWallet) {
    throw Error('this account has no in-app wallet');
  }
  if (to.toLowerCase() === inAppWallet.address.toLowerCase()) {
    throw Error("can't tip yourself");
  }
  // the same signing key is the same author, whatever wallets either of its comments proved
  const tipperKeyAddress = typeof account?.signer?.publicKey === 'string' ? getKeyAddressFromPublicKey(account.signer.publicKey) : undefined;
  if (tipperKeyAddress && tipperKeyAddress === getPartyKeyAddress(comment)) {
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

  const saved = useTipStore.getState().setPendingTip(parentCid, {
    accountId: account?.id,
    communityAddress: comment.communityAddress,
    parentCid,
    postCid: comment.postCid || parentCid,
    content: content.trim() || 'tip',
    chainId,
    transfer: { token: { chainId, type: token.type, address: token.address }, to, amountOrTokenId: String(amountOrTokenId) },
    fee: fee && config.feeRecipient ? { token: fee.token, amount: String(fee.amount), to: config.feeRecipient } : undefined,
  });
  if (!saved) {
    throw Error("the tip could not be saved in this browser's storage, so nothing was sent");
  }
  await settle(account, parentCid);
};

// a tip's reply is published once on its own; after a failed publish it is the user's call
const publishedTxHashes = new Set<string>();

// Publishing a claim is started by the effect below when the transfers are mined, and by the "publish
// the tip reply again" button, which is on screen at the same time. One at a time per tip: a second
// call before the first returns would send the claim twice.
const publishing = new Set<string>();
const publishOnce = async (txHash: string, publish: () => Promise<unknown>): Promise<void> => {
  if (publishing.has(txHash)) {
    return;
  }
  publishing.add(txHash);
  // whoever starts it, the effect must not start it again: it runs after the click, whose call may already have returned
  publishedTxHashes.add(txHash);
  try {
    await publish();
  } finally {
    publishing.delete(txHash);
  }
};

interface UseTipResult {
  pendingTip: PendingTip | undefined;
  status: string | undefined;
  error: string | undefined;
  // the transfers are mined and the reply is being, or can be, published
  mined: boolean;
  // the tip is out but its fee failed: resendFee pays it again
  feeFailed: boolean;
  // the reply was accepted and only the record is left to forget
  accepted: boolean;
  // started by another account than the active one, which can neither continue nor forget it
  otherAccount: boolean;
  resendFee: () => Promise<void>;
  sendTip: (options: SendTipOptions) => Promise<void>;
  // picks a tip up again after a reload or a failure: waits, pays an unpaid fee, publishes the reply
  resumeTip: () => Promise<void>;
  // forgets the claim. The transfer itself can't be taken back.
  discardTip: () => void;
}

// Tipping the author of a comment: optional fee transfer and tip transfer, then a reply that claims them.
const useTip = (comment: Comment | undefined, config: TippingConfig | undefined): UseTipResult => {
  const account = useAccount();
  const parentCid: string | undefined = comment?.cid;
  const pendingTip = useTipStore((state) => (parentCid ? state.pendingTips[parentCid] : undefined));
  const status = useTipStore((state) => (parentCid ? state.status[parentCid] : undefined));
  const error = useTipStore((state) => (parentCid ? state.error[parentCid] : undefined));
  const mined = useTipStore((state) => Boolean(parentCid && state.mined[parentCid]));
  const feeFailed = useTipStore((state) => Boolean(parentCid && state.feeFailed[parentCid]));
  const accepted = useTipStore((state) => Boolean(parentCid && state.accepted[parentCid]));
  const otherAccount = Boolean(pendingTip?.accountId && pendingTip.accountId !== account?.id);

  const publishCommentOptions = useMemo((): PublishCommentOptions | undefined => {
    // the challenge index comes from the community's current challenges, so a tip resumed after a
    // reload waits for the community to load instead of guessing the key
    // the claim is published by the account that sent the tip
    if (!pendingTip?.txHash || !mined || !config || (pendingTip.accountId && pendingTip.accountId !== account?.id)) {
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
          if (useTipStore.getState().pendingTips[parentCid]?.txHash === txHash && !useTipStore.getState().setPendingTip(parentCid, undefined)) {
            // the record stays, and a reload would publish its claim again: say it was accepted
            useTipStore.setState((state) => ({ accepted: { ...state.accepted, [parentCid]: true } }));
            setError(
              parentCid,
              "the community accepted the tip reply, but this browser's storage refused to delete the tip's record. Forget this tip: publishing it again would send a second reply.",
            );
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
  }, [pendingTip, mined, config, account?.id]);

  // cancelling a further challenge removes the reply without an error or a verification, and the
  // paid tip would wait for a reply that is never published again
  const onAbandon = useMemo(
    () => (parentCid ? () => setError(parentCid, 'the tip reply was cancelled. The transfer stays valid, so the reply can be published again.') : undefined),
    [parentCid],
  );
  const { publishComment } = usePublishCommentWithAbandon(publishCommentOptions, comment, onAbandon);

  // Publishing is an effect and not the end of the click handler because the publish function only
  // exists for options from a previous render, and the claim in those options is known only once
  // the transfers are mined. It also lets a tip that was mined while this comment was off screen
  // publish when the comment is shown again.
  const txHash = publishCommentOptions ? pendingTip?.txHash : undefined;
  useEffect(() => {
    if (!txHash || publishedTxHashes.has(txHash)) {
      return;
    }
    publishOnce(txHash, publishComment).catch((error: unknown) => {
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
    feeFailed,
    accepted,
    otherAccount,
    resendFee: async () => {
      if (parentCid) {
        await run(parentCid, () => resendFee(account, parentCid));
      }
    },
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
        await publishOnce(pendingTip?.txHash ?? parentCid, publishComment).catch((error: unknown) => setError(parentCid, getErrorMessage(error)));
      } else {
        await run(parentCid, () => settle(account, parentCid));
      }
    },
    discardTip: () => {
      if (parentCid && !otherAccount) {
        const forgotten = useTipStore.getState().setPendingTip(parentCid, undefined);
        useTipStore.setState((state) => ({
          mined: { ...state.mined, [parentCid]: false },
          feeFailed: { ...state.feeFailed, [parentCid]: false },
          accepted: { ...state.accepted, [parentCid]: false },
          error: {
            ...state.error,
            [parentCid]: forgotten
              ? undefined
              : "the tip was cleared here but this browser's storage refused to delete its record, so it may return when the page reloads",
          },
        }));
      }
    },
  };
};

// cheap enough for every comment in a thread: one store read, no publish machinery
export const useHasPendingTip = (parentCid: string | undefined): boolean => useTipStore((state) => Boolean(parentCid && state.pendingTips[parentCid]));

export default useTip;
