import { Suspense, use } from 'react';
import { Link } from 'react-router-dom';
import { useAuthorAddress, useBlock, useComment } from '@bitsocial/bitsocial-react-hooks';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import utils from '../../lib/utils';
import FeedPost from '../feed-post';
import { TipChecking, TipVerificationNote, TokenAmount } from '../tip-tools';
import useTippingConfig from '../../hooks/use-tipping-config';
import { useTipVerification } from '../../hooks/use-tip-verification';
import useInspectedComment, { isSameComment } from '../../hooks/use-inspected-comment';
import useInspectorAvailable from '../../hooks/use-inspector-available';
import type { TippingConfig } from '../../lib/tipping';
import styles from './tip-notification.module.css';

const excerptLength = 80;

const getExcerpt = (text: unknown): string | undefined => {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) {
    return undefined;
  }
  return trimmed.length > excerptLength ? `${trimmed.substring(0, excerptLength).trim()}…` : trimmed;
};

interface VerifiedTipNotificationProps {
  // the reply that carries the tip, with its signed records
  reply: Comment;
  // the tipped comment, which is the account's own
  parent: Comment;
  config: TippingConfig;
  // the reply as the inbox holds it, which is what the row falls back to
  notification: Comment;
  index?: number;
}

// suspends while the tip is checked: the two wallet proofs behind it, then its transaction on its chain
const VerifiedTipNotification = ({ reply, parent, config, notification, index }: VerifiedTipNotificationProps) => {
  const verification = use(useTipVerification(reply, parent, config.community));
  const { shortAuthorAddress } = useAuthorAddress({ comment: reply });
  const { blocked: hidden } = useBlock({ cid: reply.cid });
  const [inspectedComment, setInspectedComment] = useInspectedComment();
  // without the inspector pane on screen, a click would select a row nothing shows
  const inspectorAvailable = useInspectorAvailable();
  if (!verification) {
    return <FeedPost index={index} post={notification} />;
  }
  if (verification.status !== 'verified') {
    return <FeedPost index={index} post={notification} note={<TipVerificationNote verification={verification} />} />;
  }
  const { tip } = verification;
  const threadLink = `/${reply.communityAddress}/comment/${reply.cid}`;
  const tipped = getExcerpt(parent.title) ?? getExcerpt(parent.content);
  const message = getExcerpt(reply.content);
  const inspected = inspectorAvailable && isSameComment(inspectedComment, reply);
  const inspect = () => setInspectedComment(reply);
  return (
    // the row click is a mouse shortcut, the inspect button below is the keyboard path
    <div
      className={[styles.tipNotification, inspected ? styles.inspected : undefined, hidden || reply.removed ? styles.hidden : undefined].join(' ')}
      onClick={inspectorAvailable ? inspect : undefined}
    >
      <div className={styles.headline}>
        <Link to={threadLink} className={styles.amount} title={`tip ${tip.txHash} on chain id ${tip.chainId} from ${tip.from} to ${tip.to}`}>
          + tipped <TokenAmount chainId={tip.chainId} type={tip.type} address={tip.token} amount={tip.amount} />
          {tip.tokenId !== undefined && ` #${tip.tokenId}`}
        </Link>
        <span className={styles.meta}>
          <Link to={`/author/${reply.author?.address}/comment/${reply.cid}`}>u/{shortAuthorAddress}</Link> · {utils.getFormattedTime(reply.timestamp)} · to{' '}
          <Link to={`/${reply.communityAddress}`}>{reply.shortCommunityAddress || reply.communityAddress}</Link>
          {inspectorAvailable && (
            <button type='button' className={styles.inspect} onClick={inspect}>
              inspect
            </button>
          )}
        </span>
      </div>
      <div className={styles.meta}>
        on your {parent.parentCid ? 'comment' : 'post'}
        {tipped && `: "${tipped}"`}
      </div>
      {message && <div className={styles.message}>"{message}"</div>}
    </div>
  );
};

interface TipNotificationProps {
  // a reply to one of the account's comments that carries something shaped like a tip
  notification: Comment;
  index?: number;
}

// One inbox row for a reply that claims a tip. It reads as a tip only once the tip is verified, on the
// wallet proofs and on its chain. Until then it is the reply's ordinary row, with a line that says
// where the check stands.
const TipNotification = ({ notification, index }: TipNotificationProps) => {
  // a tip is shown only where the community advertises tipping/v1
  const config = useTippingConfig(notification.communityAddress);
  // The inbox keeps the reply as its parent's reply page had it. Where that copy came without its
  // signed records, which the tip is checked against, the reply is loaded.
  const hasSignedRecords = Boolean(notification.raw?.comment && notification.raw?.commentUpdate);
  const loadedReply: Comment = useComment(hasSignedRecords ? undefined : { commentCid: notification.cid });
  const reply = hasSignedRecords ? notification : loadedReply;
  // the tipped comment, whose author's wallet the tip must have been sent to
  const parent: Comment = useComment({ commentCid: notification.parentCid });
  if (!config) {
    return <FeedPost index={index} post={notification} />;
  }
  const checking = <FeedPost index={index} post={notification} note={<TipChecking />} />;
  // a comment is validated together with its update, so neither is checked before its update arrived
  if (!reply?.cid || !reply.updatedAt || !parent?.cid || !parent.updatedAt) {
    return checking;
  }
  return (
    <Suspense fallback={checking}>
      <VerifiedTipNotification reply={reply} parent={parent} config={config} notification={notification} index={index} />
    </Suspense>
  );
};

export default TipNotification;
