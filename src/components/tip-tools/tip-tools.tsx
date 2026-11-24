import { Suspense, use, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useComment } from '@bitsocial/bitsocial-react-hooks';
import type { Comment, Community } from '@bitsocial/bitsocial-react-hooks';
import {
  formatTokenAmount,
  getDecimalsInputIssue,
  getParentBindingSuffix,
  getProvenWalletAddresses,
  getRequiredFee,
  getTip,
  getTipAmountError,
  getTipReplies,
  getTokenKey,
  getTipCheck,
  getTipCheckError,
  getTipFeeConfigError,
  parseTokenAmount,
  walletSignatureType,
} from '../../lib/tipping';
import type { Tip, TipToken, TipTokenType, TippingConfig } from '../../lib/tipping';
import '../../lib/tipping-comment';
import { checkTipOnChain, getBalanceOnce, getTokenInfo } from '../../lib/tipping-chain';
import type { OnChainTipResult } from '../../lib/tipping-chain';
import { getOnChainError, getTipErrorReport } from '../../lib/tipping-verification';
import type { TipVerification } from '../../lib/tipping-verification';
import { getInAppWallet } from '../../hooks/use-in-app-wallet';
import useTip, { useHasPendingTip } from '../../hooks/use-tip';
import { recheckTip, useTipVerification, useVerifiedTipTotals } from '../../hooks/use-tip-verification';
import { useTippingRpcUrl } from '../../hooks/use-tipping-settings';
import styles from './tip-tools.module.css';

interface TokenAmountProps {
  chainId: number;
  type: TipTokenType;
  // the token contract; undefined for native
  address?: string;
  // base units; undefined shows the symbol alone
  amount?: bigint;
}

// reads the token's symbol and decimals from the chain, and suspends until it has them
const LoadedTokenAmount = ({ chainId, type, address, amount }: TokenAmountProps) => {
  const rpcUrl = useTippingRpcUrl(chainId);
  const { symbol, decimals } = use(getTokenInfo(rpcUrl, { chainId, type, address }));
  if (amount === undefined) {
    return <>{symbol}</>;
  }
  return <>{decimals === undefined ? `${amount} base units of ${symbol}` : `${formatTokenAmount(amount, decimals)} ${symbol}`}</>;
};

// '1.5 USDC'. Until the token's contract answers, the amount is shown in base units.
export const TokenAmount = (props: TokenAmountProps) => (
  <Suspense fallback={props.amount === undefined ? '...' : `${props.amount} base units`}>
    <LoadedTokenAmount {...props} />
  </Suspense>
);

// The reply as its author signed it, with the tip from its live update when one has arrived. The
// wallets and the key are read from the signed comment, and only the tip from the update, together
// with the update's signed record, which is what the tip is checked against.
const withLatestTip = (comment: Comment | undefined, updatedComment: Comment | undefined): Comment | undefined =>
  comment && updatedComment?.tip !== undefined ? { ...comment, tip: updatedComment.tip, raw: updatedComment.raw ?? comment.raw } : comment;

// the click on a row selects it for the inspector
const stopPropagation = (event: MouseEvent) => event.stopPropagation();

interface TipVerificationNoteProps {
  // a tip that is not verified, or not yet
  verification: Exclude<TipVerification, { status: 'verified' }>;
}

// Why a claimed tip is not shown as one: no RPC is set for its chain, or its check failed. It shows
// no amount, as nothing about the tip is established.
export const TipVerificationNote = ({ verification }: TipVerificationNoteProps) => {
  const [copied, setCopied] = useState(false);
  if (verification.status === 'no-rpc') {
    return (
      <span className={styles.dim} onClick={stopPropagation}>
        claims a tip on chain {verification.tip.chainId} · <Link to='/settings'>set an RPC to verify</Link>
      </span>
    );
  }
  const copy = () =>
    navigator.clipboard.writeText(getTipErrorReport(verification)).then(
      () => setCopied(true),
      () => {},
    );
  return (
    <span className={styles.note} onClick={stopPropagation}>
      <span className={styles.error}>tip failed check: {verification.error}</span>
      <button type='button' className={styles.linkButton} onClick={copy}>
        {copied ? 'copied' : 'copy error'}
      </button>
      {/* the offline check reads only the two comments, and asking again gives the same answer */}
      {(verification.onChain || verification.rpcError) && (
        <button type='button' className={styles.linkButton} onClick={() => recheckTip(verification.resultKey)}>
          recheck
        </button>
      )}
    </span>
  );
};

// shown while a tip's wallet proofs and its transaction are being checked
export const TipChecking = () => <span className={styles.dim}>checking tip…</span>;

interface TipLineProps {
  // the community's tipping options: a tip is shown only where the community advertises tipping/v1
  config?: TippingConfig;
  comment?: Comment;
  // the live version of the comment, where one has arrived
  updatedComment?: Comment;
}

interface VerifiedTipLineProps {
  config?: TippingConfig;
  comment?: Comment;
}

// suspends while the tip is checked: the two wallet proofs behind it, then its transaction on its chain
const VerifiedTipLine = ({ config, comment }: VerifiedTipLineProps) => {
  // the tipped comment, whose author's wallet the tip must have been sent to. Not fetched: a tip
  // whose parent is not loaded can't be verified, so it is not shown.
  const parent: Comment = useComment({ commentCid: comment?.parentCid, onlyIfCached: true });
  const verification = use(useTipVerification(comment, parent, config?.community));
  if (!verification) {
    return null;
  }
  if (verification.status !== 'verified') {
    // a tip whose wallet proofs don't verify stays unshown. One that only the chain can settle says so.
    return verification.status === 'failed' && !verification.onChain && !verification.rpcError ? null : <TipVerificationNote verification={verification} />;
  }
  const { tip } = verification;
  return (
    <span className={styles.tip} title={`tip ${tip.txHash} on chain id ${tip.chainId} from ${tip.from} to ${tip.to}`}>
      tipped <TokenAmount chainId={tip.chainId} type={tip.type} address={tip.token} amount={tip.amount} />
      {tip.tokenId !== undefined && ` #${tip.tokenId}`}
    </span>
  );
};

// The tip a reply carries, as the community wrote it to the comment update. Shown only once the
// tipper's and the tipped author's wallet proofs verify and are the tip's sender and receiver, and
// its transaction is found on its chain to be that transfer.
export const TipLine = ({ config, comment, updatedComment }: TipLineProps) => {
  const latest = withLatestTip(comment, updatedComment);
  // most replies carry no tip, and those mount nothing
  if (!config || !getTip(latest)) {
    return null;
  }
  return (
    <Suspense fallback={<TipChecking />}>
      <VerifiedTipLine config={config} comment={latest} />
    </Suspense>
  );
};

interface TipTotalsProps {
  config?: TippingConfig;
  comment?: Comment;
  replies?: (Comment | undefined)[];
  // the live version of each reply, by the same index, where one has arrived
  updatedReplies?: (Comment | undefined)[];
}

interface VerifiedTipTotalsProps {
  config?: TippingConfig;
  comment: Comment;
  replies: (Comment | undefined)[];
}

interface TipRowProps {
  config?: TippingConfig;
  comment: Comment;
  reply: Comment;
  tip: Tip;
}

// The offline check of one tip. Suspends while the wallet proofs are being checked.
const useTipCheckResult = (comment: Comment, reply: Comment, community?: Community) => {
  const check = use(getTipCheck(reply, comment, community));
  return { check, error: check ? getTipCheckError(check) : undefined };
};

// whether the tip is in the totals: the same verification that decides whether it is shown
const TipStatus = ({ config, comment, reply }: Omit<TipRowProps, 'tip'>) => {
  const verification = use(useTipVerification(reply, comment, config?.community));
  if (!verification) {
    return <span className={styles.error}>unverified</span>;
  }
  return verification.status === 'verified' ? <span className={styles.dim}>verified</span> : <TipVerificationNote verification={verification} />;
};

const yesNo = (value: boolean): string => (value ? 'yes' : 'no');

const TipCheckDetails = ({ config, comment, reply }: Omit<TipRowProps, 'tip'>) => {
  const { check, error } = useTipCheckResult(comment, reply, config?.community);
  if (!check) {
    return null;
  }
  return (
    <>
      <dd className={error ? styles.error : undefined}>{error ? `unverified: ${error}` : 'verified'}</dd>
      <dt>checked</dt>
      <dd>
        reply to the tipped comment: {yesNo(check.isReplyToParent)}; sender is a wallet the tipper proved: {yesNo(check.senderProven)}; receiver is a wallet the tipped
        author proved: {yesNo(check.receiverProven)}. The wallet proofs are checked in this client. A tip is shown and counted once its transaction is found on its chain;
        the lookup below shows each result, and the fee's.
      </dd>
    </>
  );
};

type OnChainState = { status: 'idle' } | { status: 'checking' } | { status: 'done'; result: OnChainTipResult } | { status: 'error'; message: string };

// Looks the tip's and its fee's transactions up through the RPC set for the chain, and shows what each
// result was. On a click: the lookup that decides whether a tip is shown is kept, and this one is not.
const OnChainCheck = ({ comment, reply, tip, config }: Pick<TipRowProps, 'comment' | 'reply' | 'tip' | 'config'>) => {
  const rpcUrl = useTippingRpcUrl(tip.chainId);
  const [state, setState] = useState<OnChainState>({ status: 'idle' });
  const verify = () => {
    if (!rpcUrl) {
      return;
    }
    setState({ status: 'checking' });
    // the transaction has to be sent by one of the tipper's proven wallets, and end with the binding of the tipped comment
    getProvenWalletAddresses(reply, undefined, config?.community)
      .then((senders) => checkTipOnChain(rpcUrl, tip, senders, getParentBindingSuffix(String(comment.cid))))
      .then(
        (result) => setState({ status: 'done', result }),
        (error: unknown) => setState({ status: 'error', message: error instanceof Error ? error.message : String(error) }),
      );
  };
  const error =
    state.status === 'done'
      ? (getOnChainError(state.result.tip, 'tip') ??
        (state.result.fee ? getOnChainError(state.result.fee, 'fee') : undefined) ??
        (config ? getTipFeeConfigError(config, tip) : undefined))
      : undefined;
  return (
    <>
      <dt>on chain</dt>
      <dd>
        {state.status === 'idle' &&
          (rpcUrl ? (
            <button type='button' onClick={verify}>
              verify with RPC
            </button>
          ) : (
            <span className={styles.dim}>not checked: no RPC url is set for chain id {tip.chainId}</span>
          ))}
        {state.status === 'checking' && <span className={styles.dim}>verifying with RPC...</span>}
        {state.status === 'error' && <span className={styles.error}>could not check: {state.message}</span>}
        {(state.status === 'error' || (state.status === 'done' && error)) && rpcUrl && (
          <>
            {' '}
            <button type='button' onClick={verify}>
              verify again
            </button>
          </>
        )}
        {state.status === 'done' &&
          (error ? (
            <span className={styles.error}>not verified: {error}</span>
          ) : (
            <span className={styles.dim}>
              verified on chain: the tip{tip.fee && ' and its fee'} {tip.fee ? 'were' : 'was'} mined, sent by the tipper, bound to this comment, and{' '}
              {tip.fee ? 'match' : 'matches'} what the community wrote
              {config ? ', and the fee follows the community config' : ''}
            </span>
          ))}
      </dd>
    </>
  );
};

// one tip of the list. It shows at once, and says "verifying" until its own check is done.
const TipRow = ({ config, comment, reply, tip }: TipRowProps) => (
  <li>
    <details>
      <summary>
        <TokenAmount chainId={tip.chainId} type={tip.type} address={tip.token} amount={tip.amount} />
        {tip.tokenId !== undefined && ` #${tip.tokenId}`} from {reply.author?.shortAddress ?? reply.author?.address}{' '}
        <span className={styles.dim}>{formatTipTime(reply.timestamp)}</span>{' '}
        <Suspense fallback={<span className={styles.dim}>verifying...</span>}>
          <TipStatus config={config} comment={comment} reply={reply} />
        </Suspense>
      </summary>
      <dl className={styles.tipDetails}>
        <dt>status</dt>
        <Suspense fallback={<dd className={styles.dim}>verifying the wallet proofs...</dd>}>
          <TipCheckDetails comment={comment} reply={reply} />
        </Suspense>
        <dt>message</dt>
        <dd>{reply.content || <span className={styles.dim}>none</span>}</dd>
        <dt>tipper</dt>
        <dd>{reply.author?.address}</dd>
        <dt>from wallet</dt>
        <dd>{tip.from}</dd>
        <dt>to wallet</dt>
        <dd>{tip.to}</dd>
        <dt>token</dt>
        <dd>
          {tip.type}
          {tip.token && ` ${tip.token}`}
          {tip.tokenId !== undefined && ` #${tip.tokenId}`}
        </dd>
        {tip.amount !== undefined && (
          <>
            <dt>amount</dt>
            <dd>
              <TokenAmount chainId={tip.chainId} type={tip.type} address={tip.token} amount={tip.amount} /> ({tip.amount.toString()} base units)
            </dd>
          </>
        )}
        <dt>chain id</dt>
        <dd>{tip.chainId}</dd>
        <dt>transaction</dt>
        <dd>{tip.txHash}</dd>
        {tip.fee && (
          <>
            <dt>fee</dt>
            <dd>
              <TokenAmount chainId={tip.chainId} type={tip.fee.token ? 'erc20' : 'native'} address={tip.fee.token} amount={tip.fee.amount} /> to {tip.fee.to}, transaction{' '}
              {tip.fee.txHash}
            </dd>
          </>
        )}
        <OnChainCheck comment={comment} reply={reply} tip={tip} config={config} />
        <dt>reply</dt>
        <dd>{reply.cid}</dd>
      </dl>
    </details>
  </li>
);

interface TipListProps {
  config?: TippingConfig;
  comment: Comment;
  replies: (Comment | undefined)[];
}

const formatTipTime = (timestamp: unknown): string => (typeof timestamp === 'number' ? new Date(timestamp * 1000).toLocaleString() : 'unknown');

// Every tip the loaded replies claim for the comment, newest first, each with its own verification
// state. A tip that does not verify is listed as unverified and is not in the totals.
const TipList = ({ config, comment, replies }: TipListProps) => {
  const entries = getTipReplies(comment, replies)
    .flatMap((reply) => {
      const tip = getTip(reply);
      return tip ? [{ reply, tip }] : [];
    })
    .sort((a, b) => (b.reply.timestamp ?? 0) - (a.reply.timestamp ?? 0));
  return (
    <ul className={styles.tipList}>
      {entries.map(({ reply, tip }) => (
        <TipRow key={reply.cid ?? tip.txHash} config={config} comment={comment} reply={reply} tip={tip} />
      ))}
    </ul>
  );
};

const VerifiedTipTotals = ({ config, comment, replies }: VerifiedTipTotalsProps) => {
  const [isListOpen, setIsListOpen] = useState(false);
  const totals = use(useVerifiedTipTotals(comment, replies, config?.community));
  if (!totals.length) {
    return null;
  }
  return (
    <>
      <span className={styles.tip} title='summed per chain and token from the tips on the loaded replies that are verified on their chain'>
        tips:{' '}
        {totals.map((total, index) => (
          <span key={getTokenKey({ ...total, address: total.token })}>
            {index > 0 && ', '}
            <TokenAmount chainId={total.chainId} type={total.type} address={total.token} amount={total.amount} />
            {total.type === 'erc721' && ` ×${total.count}`}
          </span>
        ))}
      </span>
      <button
        type='button'
        className={styles.linkButton}
        aria-expanded={isListOpen}
        onClick={(event) => {
          event.stopPropagation();
          setIsListOpen(!isListOpen);
        }}
      >
        {isListOpen ? 'hide tips' : 'list tips'}
      </button>
      {isListOpen && (
        <div className={styles.tipListWrapper} onClick={stopPropagation}>
          <Suspense fallback={<span className={styles.dim}>checking the tips...</span>}>
            <TipList config={config} comment={comment} replies={replies} />
          </Suspense>
        </div>
      )}
    </>
  );
};

// what a comment was tipped, summed from its loaded replies, one total per token. A tip that does
// not verify against its tipper's and this comment's author's wallets, or whose transaction is not
// found on its chain to be that transfer, is left out.
export const TipTotals = ({ config, comment, replies, updatedReplies }: TipTotalsProps) => {
  const latestReplies = replies?.map((reply, index) => withLatestTip(reply, updatedReplies?.[index])) ?? [];
  if (!config || !comment || !getTipReplies(comment, latestReplies).length) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <VerifiedTipTotals config={config} comment={comment} replies={latestReplies} />
    </Suspense>
  );
};

interface TipFormProps {
  comment: Comment;
  config: TippingConfig;
  tokens: TipToken[];
}

interface TokenBalanceProps {
  token: TipToken;
  // the in-app wallet that pays
  owner: string;
}

// what the in-app wallet holds of the token, in whole tokens, or the number of NFTs held
const LoadedTokenBalance = ({ token, owner }: TokenBalanceProps) => {
  const rpcUrl = useTippingRpcUrl(token.chainId);
  const { symbol, decimals } = use(getTokenInfo(rpcUrl, token));
  const balance = use(getBalanceOnce(rpcUrl, token, owner));
  if (balance === undefined) {
    return <>balance unavailable</>;
  }
  if (token.type === 'erc721') {
    return (
      <>
        you hold {String(balance)} {symbol}
      </>
    );
  }
  return (
    <>
      you have {decimals === undefined ? `${balance} base units of` : formatTokenAmount(balance, decimals)} {symbol}
    </>
  );
};

const TokenBalance = (props: TokenBalanceProps) => (
  <Suspense fallback='checking balance...'>
    <LoadedTokenBalance {...props} />
  </Suspense>
);

interface TipInputsProps {
  config: TippingConfig;
  tokens: TipToken[];
  // a tip is under way
  busy: boolean;
  sendTip: (options: { token: TipToken; amountOrTokenId: bigint; content: string }) => Promise<void>;
}

const LoadedTipInputs = ({ config, tokens, busy, sendTip }: TipInputsProps) => {
  const [tokenKey, setTokenKey] = useState(getTokenKey(tokens[0]));
  const [amountText, setAmountText] = useState('');
  const [content, setContent] = useState('');
  const token = tokens.find((token) => getTokenKey(token) === tokenKey) ?? tokens[0];
  const rpcUrl = useTippingRpcUrl(token.chainId);
  const { decimals } = use(getTokenInfo(rpcUrl, token));
  const inAppWalletAddress = getInAppWallet(useAccount())?.address;

  // An NFT is tipped by its token id; a fungible amount is typed in whole tokens. When a token's decimals
  // could not be read no amount is parsed: reading it as base units and then as whole tokens once a later
  // read succeeds would change what the same typed number means.
  const decimalsIssue = getDecimalsInputIssue(token, rpcUrl, decimals);
  const decimalsUnknown = decimalsIssue !== undefined;
  const amountOrTokenId =
    token.type === 'erc721'
      ? /^\d+$/.test(amountText.trim())
        ? BigInt(amountText.trim())
        : undefined
      : decimalsUnknown
        ? undefined
        : parseTokenAmount(amountText, decimals ?? 0);
  const inputError = decimalsUnknown
    ? decimalsIssue
    : token.type === 'erc721'
      ? amountOrTokenId === undefined
        ? 'invalid token id'
        : undefined
      : getTipAmountError(token, amountOrTokenId);
  const fee = amountOrTokenId !== undefined && !inputError ? getRequiredFee(config, token, token.type === 'erc721' ? 0n : amountOrTokenId) : undefined;

  return (
    <>
      <select aria-label='Tip token' value={getTokenKey(token)} onChange={(event) => setTokenKey(event.target.value)}>
        {tokens.map((token) => (
          <option key={getTokenKey(token)} value={getTokenKey(token)}>
            chain {token.chainId} {token.type} {token.address ?? ''}
          </option>
        ))}
      </select>
      {inAppWalletAddress && (
        <span className={styles.dim}>
          <TokenBalance token={token} owner={inAppWalletAddress} />
        </span>
      )}
      <input
        aria-label={token.type === 'erc721' ? 'Token id' : 'Tip amount'}
        className={styles.amount}
        placeholder={token.type === 'erc721' ? 'token id' : 'amount'}
        value={amountText}
        onChange={(event) => setAmountText(event.target.value)}
      />
      <TokenAmount chainId={token.chainId} type={token.type} address={token.address} />
      <input aria-label='Tip message' className={styles.content} placeholder='message (optional)' value={content} onChange={(event) => setContent(event.target.value)} />
      <button
        type='button'
        disabled={busy || amountOrTokenId === undefined || Boolean(inputError)}
        onClick={() => amountOrTokenId !== undefined && sendTip({ token, amountOrTokenId, content })}
      >
        send tip
      </button>
      <span className={[styles.line, styles.dim].join(' ')}>
        {token.minAmount !== undefined && (
          <>
            minimum <TokenAmount chainId={token.chainId} type={token.type} address={token.address} amount={token.minAmount} />.{' '}
          </>
        )}
        {fee ? (
          <>
            community fee <TokenAmount chainId={token.chainId} type={fee.token ? 'erc20' : 'native'} address={fee.token} amount={fee.amount} />, paid on top in a second
            transaction.
          </>
        ) : (
          amountText && (inputError ?? 'no community fee.')
        )}
      </span>
    </>
  );
};

// The form, and the state of a tip already under way. A tip that was sent but whose reply is not
// accepted yet is listed with a way to continue, since its transfer can't be taken back.
const TipForm = ({ comment, config, tokens }: TipFormProps) => {
  const { pendingTip, status, error, mined, feeFailed, accepted, claimPublished, otherAccount, sendTip, resumeTip, resendFee, discardTip } = useTip(comment, config);
  const discard = () => {
    if (
      window.confirm(
        mined
          ? 'forget this tip? its transfer was already sent and stays sent, only the reply that claims it is dropped.'
          : 'forget this tip? its transfer was signed and may already have been sent, and stays sent if it was. Only the reply that claims it is dropped.',
      )
    ) {
      discardTip();
    }
  };

  return (
    <div className={styles.form} onClick={stopPropagation}>
      {pendingTip ? (
        <>
          <span className={styles.dim} title={pendingTip.feeTxHash ? `fee ${pendingTip.feeTxHash}` : undefined}>
            {pendingTip.txHash ? `tip ${mined ? 'sent' : 'signed, not confirmed yet'} in ${pendingTip.txHash}` : 'tip not sent yet'}
          </span>
          {!status &&
            (otherAccount ? (
              <span className={styles.dim}>started by another account: switch back to it to continue</span>
            ) : (
              <>
                {accepted ? null : feeFailed ? (
                  <button type='button' onClick={resendFee}>
                    resend fee
                  </button>
                ) : mined && claimPublished && !error ? (
                  // it went out before this page loaded or is waiting for the community: publishing again is the user's call
                  <>
                    <span className={styles.dim}>the tip reply was published, waiting for the community</span>
                    <button type='button' onClick={resumeTip}>
                      publish the tip reply again
                    </button>
                  </>
                ) : mined && !error ? (
                  // its reply is being published or waits for the community, and publishing again now would send the claim twice
                  <span className={styles.dim}>publishing the tip reply...</span>
                ) : (
                  <button type='button' onClick={resumeTip}>
                    {mined ? 'publish the tip reply again' : 'continue'}
                  </button>
                )}
                <button type='button' onClick={discard}>
                  forget
                </button>
              </>
            ))}
        </>
      ) : tokens.length ? (
        <Suspense fallback={<span className={styles.dim}>reading the token...</span>}>
          <LoadedTipInputs config={config} tokens={tokens} busy={Boolean(status)} sendTip={sendTip} />
        </Suspense>
      ) : null}
      {status && <span className={[styles.line, styles.status].join(' ')}>{status}</span>}
      {error && <span className={[styles.line, styles.error].join(' ')}>{error}</span>}
    </div>
  );
};

// Whether a comment's author published a wallet that could be paid. Only the shape is read here, so
// that every comment in a thread stays cheap; the proof itself is verified when a tip is sent.
const hasWalletEntry = (comment: Comment | undefined): boolean => {
  const wallets: unknown = comment?.author?.wallets;
  return Boolean(wallets && typeof wallets === 'object' && Object.values(wallets).some((wallet) => wallet?.signature?.type === walletSignatureType));
};

interface TipRecoveryProps {
  comment: Comment;
}

// A tip that was started and whose community no longer publishes tipping/v1 options: its reply can't
// be published, but its transaction hash stays visible and the record can be forgotten.
const TipRecovery = ({ comment }: TipRecoveryProps) => {
  const { pendingTip, otherAccount, discardTip } = useTip(comment, undefined);
  if (!pendingTip) {
    return null;
  }
  return (
    <div className={styles.form} onClick={stopPropagation}>
      <span className={styles.dim}>
        {pendingTip.txHash ? `tip signed in ${pendingTip.txHash}` : 'tip not sent yet'}. The community's tipping options are not loaded or no longer published, so its
        reply can't be published now.
      </span>
      {!otherAccount && (
        <button
          type='button'
          onClick={() =>
            window.confirm('forget this tip? its transfer may already have been sent and stays sent if it was. Only the reply that claims it is dropped.') && discardTip()
          }
        >
          forget
        </button>
      )}
    </div>
  );
};

interface TipToolsProps {
  comment?: Comment;
  config?: TippingConfig;
}

// The tip action of a comment. Renders nothing unless the community publishes tipping/v1 options
// and the comment's author published a wallet. Meant to sit in a wrapping
// flex row: the form takes a line of its own below the button.
function TipTools({ comment, config }: TipToolsProps) {
  const [isOpen, setIsOpen] = useState(false);
  // a tip of this comment whose reply is not accepted yet keeps the form on screen
  const hasPendingTip = useHasPendingTip(comment?.cid);
  // any proven wallet of the author can be paid on any chain, so every whitelisted token is offered
  const tokens = config && hasWalletEntry(comment) ? config.tokens : [];
  if (comment?.cid && !config && hasPendingTip) {
    return <TipRecovery comment={comment} />;
  }
  if (!comment?.cid || !config || (!tokens.length && !hasPendingTip)) {
    return null;
  }
  const toggle = (event: MouseEvent) => {
    event.stopPropagation();
    setIsOpen(!isOpen);
  };
  return (
    <>
      {tokens.length > 0 && (
        <button type='button' className={styles.linkButton} onClick={toggle} aria-expanded={isOpen}>
          tip
        </button>
      )}
      {(isOpen || hasPendingTip) && <TipForm comment={comment} config={config} tokens={tokens} />}
    </>
  );
}

export default TipTools;
