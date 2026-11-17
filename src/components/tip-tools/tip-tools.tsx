import { Suspense, use, useState, type MouseEvent } from 'react';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { formatTokenAmount, getRequiredFee, getTip, getTipAmountError, getTipTotals, getTokenKey, parseTokenAmount, walletSignatureType } from '../../lib/tipping';
import type { TipToken, TipTokenType, TippingConfig } from '../../lib/tipping';
import { getTokenInfo } from '../../lib/tipping-chain';
import useTip, { useHasPendingTip } from '../../hooks/use-tip';
import { useTippingRpcUrl } from '../../hooks/use-tipping-settings';
import styles from './tip-tools.module.css';

interface TokenAmountProps {
  chainTicker: string;
  type: TipTokenType;
  // the token contract; undefined for native
  address?: string;
  // base units; undefined shows the symbol alone
  amount?: bigint;
}

// reads the token's symbol and decimals from the chain, and suspends until it has them
const LoadedTokenAmount = ({ chainTicker, type, address, amount }: TokenAmountProps) => {
  const rpcUrl = useTippingRpcUrl(chainTicker);
  const { symbol, decimals } = use(getTokenInfo(rpcUrl, { chainTicker, type, address }));
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

interface TipLineProps {
  comment?: Comment;
}

// the verified tip a reply carries, as the community wrote it to the comment update
export const TipLine = ({ comment }: TipLineProps) => {
  const tip = getTip(comment);
  if (!tip) {
    return null;
  }
  return (
    <span className={styles.tip} title={`tip ${tip.txHash} from ${tip.from} to ${tip.to}`}>
      tipped <TokenAmount chainTicker={tip.chainTicker} type={tip.type} address={tip.token} amount={tip.amount} />
      {tip.tokenId !== undefined && ` #${tip.tokenId}`}
    </span>
  );
};

interface TipTotalsProps {
  comment?: Comment;
  replies?: (Comment | undefined)[];
  // the live version of each reply, by the same index, where one has arrived
  updatedReplies?: (Comment | undefined)[];
}

// what a comment was tipped, summed from its loaded replies, one total per token
export const TipTotals = ({ comment, replies, updatedReplies }: TipTotalsProps) => {
  const totals = getTipTotals(
    comment?.cid,
    replies?.map((reply, index) => updatedReplies?.[index] || reply),
  );
  if (!totals.length) {
    return null;
  }
  return (
    <span className={styles.tip} title='summed from the loaded replies'>
      tips:{' '}
      {totals.map((total, index) => (
        <span key={getTokenKey({ ...total, address: total.token })}>
          {index > 0 && ', '}
          <TokenAmount chainTicker={total.chainTicker} type={total.type} address={total.token} amount={total.amount} />
          {total.type === 'erc721' && ` ×${total.count}`}
        </span>
      ))}
    </span>
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
  const rpcUrl = useTippingRpcUrl(token.chainTicker);
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
            {token.chainTicker} {token.type} {token.address ?? ''}
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
      <TokenAmount chainTicker={token.chainTicker} type={token.type} address={token.address} />
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
            minimum <TokenAmount chainTicker={token.chainTicker} type={token.type} address={token.address} amount={token.minAmount} />.{' '}
          </>
        )}
        {fee ? (
          <>
            community fee <TokenAmount chainTicker={token.chainTicker} type={fee.token ? 'erc20' : 'native'} address={fee.token} amount={fee.amount} />, paid on top in a
            second transaction.
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
  // the click on a reply's body selects it for the inspector
  const stopPropagation = (event: MouseEvent) => event.stopPropagation();
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
            tip sent in {pendingTip.txHash}
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

// the tokens a comment's author can be tipped in: whitelisted by the community, on a chain the author published a wallet for
const getTippableTokens = (comment: Comment | undefined, config: TippingConfig | undefined): TipToken[] =>
  (config?.tokens ?? []).filter((token) => comment?.author?.wallets?.[token.chainTicker]?.signature?.type === walletSignatureType);

interface TipToolsProps {
  comment?: Comment;
  config?: TippingConfig;
}

// The tip action of a comment. Renders nothing unless the community publishes tipping/v1 options
// and the comment's author published a wallet on a whitelisted chain. Meant to sit in a wrapping
// flex row: the form takes a line of its own below the button.
function TipTools({ comment, config }: TipToolsProps) {
  const [isOpen, setIsOpen] = useState(false);
  // a tip of this comment whose reply is not accepted yet keeps the form on screen
  const hasPendingTip = useHasPendingTip(comment?.cid);
  const tokens = getTippableTokens(comment, config);
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
