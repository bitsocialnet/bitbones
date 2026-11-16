import { Link } from 'react-router-dom';
import { useBlock, useAuthorAddress, useEditedComment } from '@bitsocial/bitsocial-react-hooks';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import utils from '../../lib/utils';
import Arrow from '../icons/arrow';
import PostTools from '../post-tools';
import CommentMedia from '../comment-media';
import { CommentLine } from '../protocol-details';
import useUnreadReplyCount from '../../hooks/use-unread-reply-count';
import useUpvote from '../../hooks/use-upvote';
import useDownvote from '../../hooks/use-downvote';
import useCommentLabels from '../../hooks/use-comment-labels';
import useVerbose from '../../hooks/use-verbose';
import useInspectedComment, { isSameComment } from '../../hooks/use-inspected-comment';
import useInspectorAvailable from '../../hooks/use-inspector-available';
import styles from './feed-post.module.css';

interface FeedPostProps {
  // useAuthorComments hands back (Comment | undefined)[], and every read below is optional chained
  post?: Comment;
  updatedPost?: Comment;
  index?: number;
}

// one post in a feed: score, title, one meta line, the verbose protocol line, media collapsed behind [+].
// clicking the row inspects it in the right pane.
const FeedPost = ({ post, updatedPost }: FeedPostProps) => {
  if (!updatedPost) {
    updatedPost = post;
  }

  // handle pending mod or author edit
  const { state: editedPostState, editedComment: editedPost } = useEditedComment({ comment: post });
  if (editedPost) {
    post = editedPost;
  }

  // post is pending until it has a cid
  const internalLink = !post?.cid && post?.index !== undefined ? `/profile/${post.index}` : `/p/${post?.communityAddress}/c/${post?.cid}`;
  const { blocked: hidden } = useBlock({ cid: post?.cid });
  const { shortAuthorAddress } = useAuthorAddress({ comment: post });
  const [unreadReplyCount] = useUnreadReplyCount(updatedPost);
  const [upvoted, upvote] = useUpvote(post);
  const [downvoted, downvote] = useDownvote(post);
  const labels = useCommentLabels(updatedPost, editedPostState);
  const [verbose] = useVerbose();
  const [inspectedComment, setInspectedComment] = useInspectedComment();
  // without the inspector pane on screen, a click would select a row nothing shows
  const inspectorAvailable = useInspectorAvailable();
  const inspected = inspectorAvailable && isSameComment(inspectedComment, post);

  const score = (updatedPost?.upvoteCount || 0) - (updatedPost?.downvoteCount || 0);
  const title = (post?.title?.trim?.() || post?.content?.trim?.())?.substring?.(0, 300) || '-';
  const host = post?.link ? utils.getHost(post.link) : '';
  const inspect = () => setInspectedComment(updatedPost);

  return (
    // the row click is a mouse shortcut, the inspect button below is the keyboard path
    <div
      className={[styles.feedPost, inspected ? styles.inspected : undefined, hidden || post?.removed ? styles.hidden : undefined].join(' ')}
      onClick={inspectorAvailable ? inspect : undefined}
    >
      <div className={styles.score}>
        <button type='button' className={[styles.vote, upvoted ? styles.voted : undefined].join(' ')} onClick={upvote} aria-label='upvote' aria-pressed={upvoted}>
          <Arrow />
        </button>
        <PostTools post={post}>
          <span className={[styles.scoreNumber, score < 0 ? styles.negative : undefined].join(' ')} title='post tools'>
            {score}
          </span>
        </PostTools>
        <button
          type='button'
          className={[styles.vote, styles.downvote, downvoted ? styles.voted : undefined].join(' ')}
          onClick={downvote}
          aria-label='downvote'
          aria-pressed={downvoted}
        >
          <Arrow />
        </button>
      </div>
      <div className={styles.body}>
        <div className={styles.titleLine}>
          <Link to={internalLink} className={styles.title}>
            {title}
          </Link>
          {labels.map((label) => (
            <span key={label} className={styles.label}>
              {label}
            </span>
          ))}
          {host && (
            <a href={post?.link} target='_blank' rel='noreferrer' className={styles.host}>
              {host}
            </a>
          )}
        </div>
        <div className={styles.meta}>
          {utils.getFormattedTime(post?.timestamp)} by <Link to={`/u/${post?.author?.address}/c/${post?.cid}`}>u/{shortAuthorAddress}</Link> to{' '}
          <Link to={`/p/${post?.communityAddress}`}>p/{post?.shortCommunityAddress || post?.communityAddress}</Link> ·{' '}
          <Link to={internalLink} className={styles.comments}>
            {updatedPost?.replyCount || 0} comments
          </Link>
          {typeof unreadReplyCount === 'number' && unreadReplyCount > 0 && <span className={styles.unread}> +{unreadReplyCount}</span>}
          <button type='button' className={styles.inspect} onClick={inspect}>
            inspect
          </button>
        </div>
        {verbose && <CommentLine comment={post} updatedComment={updatedPost} />}
        <CommentMedia comment={post} />
      </div>
    </div>
  );
};

export default FeedPost;
