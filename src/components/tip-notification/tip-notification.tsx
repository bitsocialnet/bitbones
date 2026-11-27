import { Suspense, use } from 'react';
import { Link } from 'react-router-dom';
import { useAuthorAddress, useBlock, useComment, useComments } from '@bitsocial/bitsocial-react-hooks';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import utils from '../../lib/utils';
import { getCommentLoadError } from '../../lib/load-errors';
import FeedPost from '../feed-post';
import { TipChecking, TipVerificationNote, TokenAmount } from '../tip-tools';
import useTippingConfig from '../../hooks/use-tipping-config';
import { useTipVerification } from '../../hooks/use-tip-verification';
import useInspectedComment, { isSameComment } from '../../hooks/use-inspected-comment';
import useInspectorAvailable from '../../hooks/use-inspector-available';
import { claimsSameTransaction } from '../../lib/tipping';
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
  rivals?: Comment[];
  index?: number;
}

// suspends while the tip is checked: the two wallet proofs behind it, then its transaction on its chain
const VerifiedTipNotification = ({ reply, parent, config, notification, rivals, index }: VerifiedTipNotificationProps) => {
  const verification = use(useTipVerification(reply, parent, config.community, rivals));
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

// The inbox keeps a reply as its parent's reply page had it. A tip is checked against the reply's signed
// records, and a copy that came without them does not verify.
const hasSignedRecords = (comment: Comment): boolean => Boolean(comment.raw?.comment && comment.raw?.commentUpdate);

// a comment is validated together with its update, so it is not checked before its update arrived
const isLoaded = (comment: Comment | undefined): comment is Comment => Boolean(comment?.cid && comment.updatedAt);

interface TipNotificationProps {
  // a reply to one of the account's comments that carries something shaped like a tip
  notification: Comment;
  // the earlier replies to the same comment that claim the same transaction, as the inbox holds them
  rivals?: Comment[];
  index?: number;
}

// One inbox row for a reply that claims a tip. It reads as a tip only once the tip is verified, on the
// wallet proofs and on its chain. Until then it is the reply's ordinary row, with a line that says
// where the check stands.
const TipNotification = ({ notification, rivals, index }: TipNotificationProps) => {
  // a tip is shown only where the community advertises tipping/v1
  const config = useTippingConfig(notification.communityAddress);
  // where the inbox's copy came without its signed records, the reply is loaded
  const loadedReply: Comment = useComment(hasSignedRecords(notification) ? undefined : { commentCid: notification.cid });
  const reply = hasSignedRecords(notification) ? notification : loadedReply;
  // The earlier claims are loaded the same way. One that could not be checked would not count as
  // verified, and this reply would then show the same payment as a second tip.
  const rivalCidsToLoad = (rivals ?? []).flatMap((rival) => (hasSignedRecords(rival) ? [] : [String(rival.cid)]));
  const { comments: loadedRivals, state: rivalsState } = useComments(rivalCidsToLoad.length ? { commentCids: rivalCidsToLoad } : undefined);
  const checkedRivals = (rivals ?? []).map((rival) => (hasSignedRecords(rival) ? rival : loadedRivals[rivalCidsToLoad.indexOf(String(rival.cid))]));
  // the tipped comment, whose author's wallet the tip must have been sent to
  const parent: Comment = useComment({ commentCid: notification.parentCid });
  if (!config) {
    return <FeedPost index={index} post={notification} />;
  }
  // A load that failed is not waited for. Without the reply or the tipped comment the tip can't be
  // checked, and the row says so. (The hooks report no failed load for the account's own comment.)
  const failedLoad = getCommentLoadError(reply) ? 'the reply' : getCommentLoadError(parent) ? 'the tipped comment' : undefined;
  if (failedLoad && (!isLoaded(reply) || !isLoaded(parent))) {
    return <FeedPost index={index} post={notification} note={<span className={styles.unchecked}>tip not checked: {failedLoad} failed to load</span>} />;
  }
  const checking = <FeedPost index={index} post={notification} note={<TipChecking />} />;
  // useComments is failed once none of the earlier claims is still loading and one failed: one that
  // did not load can't be checked, and takes nothing from this reply
  if (!isLoaded(reply) || !isLoaded(parent) || (rivalsState !== 'failed' && !checkedRivals.every(isLoaded))) {
    return checking;
  }
  // the live update of an earlier reply may by now carry another tip, which is no claim on this one
  const settledRivals = checkedRivals.filter(isLoaded).filter((rival) => claimsSameTransaction(rival, reply));
  return (
    <Suspense fallback={checking}>
      <VerifiedTipNotification reply={reply} parent={parent} config={config} notification={notification} rivals={settledRivals} index={index} />
    </Suspense>
  );
};

export default TipNotification;
