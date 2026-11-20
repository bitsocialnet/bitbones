import { Suspense, use, useState, type MouseEvent } from 'react';
import { useComment } from '@bitsocial/bitsocial-react-hooks';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import {
  formatTokenAmount,
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
  getVerifiedTip,
  getVerifiedTipTotals,
  parseTokenAmount,
  walletSignatureType,
} from '../../lib/tipping';
import type { Tip, TipToken, TipTokenType, TippingConfig } from '../../lib/tipping';
import { checkTipOnChain, getTokenInfo } from '../../lib/tipping-chain';
import type { OnChainTipCheck, OnChainTipResult } from '../../lib/tipping-chain';
import useTip, { useHasPendingTip } from '../../hooks/use-tip';
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
const TokenAmount = (props: TokenAmountProps) => (
  <Suspense fallback={props.amount === undefined ? '...' : `${props.amount} base units`}>
    <LoadedTokenAmount {...props} />
  </Suspense>
);

// The reply as its author signed it, with the tip from its live update when one has arrived. The
// wallets and the key are read from the signed comment, and only the tip from the update.
const withLatestTip = (comment: Comment | undefined, updatedComment: Comment | undefined): Comment | undefined =>
  comment && updatedComment?.tip !== undefined ? { ...comment, tip: updatedComment.tip } : comment;

interface TipLineProps {
  comment?: Comment;
  // the live version of the comment, where one has arrived
  updatedComment?: Comment;
}

interface VerifiedTipLineProps {
  comment?: Comment;
}

// suspends while the two wallet proofs behind the tip are checked, and shows nothing if one fails
const VerifiedTipLine = ({ comment }: VerifiedTipLineProps) => {
  // the tipped comment, whose author's wallet the tip must have been sent to. Not fetched: a tip
  // whose parent is not loaded can't be verified, so it is not shown.
  const parent: Comment = useComment({ commentCid: comment?.parentCid, onlyIfCached: true });
  const tip = use(getVerifiedTip(comment, parent));
  if (!tip) {
    return null;
  }
  return (
    <span className={styles.tip} title={`tip ${tip.txHash} on chain id ${tip.chainId} from ${tip.from} to ${tip.to}`}>
      tipped <TokenAmount chainId={tip.chainId} type={tip.type} address={tip.token} amount={tip.amount} />
      {tip.tokenId !== undefined && ` #${tip.tokenId}`}
    </span>
  );
};

// The tip a reply carries, as the community wrote it to the comment update. Shown only once the
// tipper's and the tipped author's wallet proofs verify and are the tip's sender and receiver.
export const TipLine = ({ comment, updatedComment }: TipLineProps) => {
  const latest = withLatestTip(comment, updatedComment);
  // most replies carry no tip, and those mount nothing
  if (!getTip(latest)) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <VerifiedTipLine comment={latest} />
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
const useTipCheckResult = (comment: Comment, reply: Comment) => {
  const check = use(getTipCheck(reply, comment));
  return { check, error: check ? getTipCheckError(check) : undefined };
};

const TipStatus = ({ comment, reply }: Omit<TipRowProps, 'tip'>) => {
  const { error } = useTipCheckResult(comment, reply);
  return error ? <span className={styles.error}>unverified</span> : <span className={styles.dim}>verified</span>;
};

const yesNo = (value: boolean): string => (value ? 'yes' : 'no');

const TipCheckDetails = ({ comment, reply }: Omit<TipRowProps, 'tip'>) => {
  const { check, error } = useTipCheckResult(comment, reply);
  if (!check) {
    return null;
  }
  return (
    <>
      <dd className={error ? styles.error : undefined}>{error ? `unverified: ${error}` : 'verified'}</dd>
      <dt>checked</dt>
      <dd>
        reply to the tipped comment: {yesNo(check.isReplyToParent)}; sender is a wallet the tipper proved: {yesNo(check.senderProven)}; receiver is a wallet the tipped
        author proved: {yesNo(check.receiverProven)}. The wallet proofs are checked in this client. The transaction is only looked up when you ask below, otherwise its
        existence is the community's word.
      </dd>
    </>
  );
};

type OnChainState = { status: 'idle' } | { status: 'checking' } | { status: 'done'; result: OnChainTipResult } | { status: 'error'; message: string };

const getOnChainError = (result: OnChainTipCheck, what: string): string | undefined => {
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

// Looks the transaction up through the RPC set for its chain. Only on a click: every check is an
// RPC call, and a thread can carry many tips.
const OnChainCheck = ({ comment, reply, tip, config }: Pick<TipRowProps, 'comment' | 'reply' | 'tip' | 'config'>) => {
  const rpcUrl = useTippingRpcUrl(tip.chainId);
  const [state, setState] = useState<OnChainState>({ status: 'idle' });
  const verify = () => {
    if (!rpcUrl) {
      return;
    }
    setState({ status: 'checking' });
    // the transaction has to be sent by one of the tipper's proven wallets, and end with the binding of the tipped comment
    getProvenWalletAddresses(reply)
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
          <TipStatus comment={comment} reply={reply} />
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

// the click on a reply's body selects it for the inspector
const stopPropagation = (event: MouseEvent) => event.stopPropagation();

const VerifiedTipTotals = ({ config, comment, replies }: VerifiedTipTotalsProps) => {
  const [isListOpen, setIsListOpen] = useState(false);
  const totals = use(getVerifiedTipTotals(comment, replies));
  if (!totals.length) {
    return null;
  }
  return (
    <>
      <span className={styles.tip} title='summed per chain and token from the verified tips on the loaded replies'>
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
// not verify against its tipper's and this comment's author's wallets is left out.
export const TipTotals = ({ config, comment, replies, updatedReplies }: TipTotalsProps) => {
  const latestReplies = replies?.map((reply, index) => withLatestTip(reply, updatedReplies?.[index])) ?? [];
  if (!comment || !getTipReplies(comment, latestReplies).length) {
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

  // an NFT is tipped by its token id; a fungible amount is typed in whole tokens when the decimals are known
  const amountOrTokenId =
    token.type === 'erc721' ? (/^\d+$/.test(amountText.trim()) ? BigInt(amountText.trim()) : undefined) : parseTokenAmount(amountText, decimals ?? 0);
  const inputError = token.type === 'erc721' ? (amountOrTokenId === undefined ? 'invalid token id' : undefined) : getTipAmountError(token, amountOrTokenId);
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
      <input
        aria-label={token.type === 'erc721' ? 'Token id' : 'Tip amount'}
        className={styles.amount}
        placeholder={token.type === 'erc721' ? 'token id' : decimals === undefined ? 'base units' : 'amount'}
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
  const { pendingTip, status, error, mined, sendTip, resumeTip, discardTip } = useTip(comment, config);
  const discard = () => {
    if (window.confirm('forget this tip? its transfer was already sent and stays sent, only the reply that claims it is dropped.')) {
      discardTip();
    }
  };

  return (
    <div className={styles.form} onClick={stopPropagation}>
      {pendingTip ? (
        <>
          <span className={styles.dim} title={pendingTip.feeTxHash ? `fee ${pendingTip.feeTxHash}` : undefined}>
            {pendingTip.txHash ? `tip sent in ${pendingTip.txHash}` : 'tip not sent yet'}
          </span>
          {!status && (
            <>
              <button type='button' onClick={resumeTip}>
                {mined ? 'publish the tip reply again' : 'continue'}
              </button>
              <button type='button' onClick={discard}>
                forget
              </button>
            </>
          )}
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
