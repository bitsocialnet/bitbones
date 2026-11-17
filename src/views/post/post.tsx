import { useEffect, useState, type MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useComment, useEditedComment, useAccountComment, useReplies, useBlock, useAuthorAddress } from '@bitsocial/bitsocial-react-hooks';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import utils from '../../lib/utils';
import Arrow from '../../components/icons/arrow';
import PostTools from '../../components/post-tools';
import PostReplyTools from '../../components/post-reply-tools';
import ReplyTools from '../../components/reply-tools';
import Panes from '../../components/panes';
import Inspector from '../../components/inspector';
import CommunityInfo from '../../components/community-info';
import CommentMedia from '../../components/comment-media';
import TipTools, { TipLine, TipTotals } from '../../components/tip-tools';
import { CommentLine } from '../../components/protocol-details';
import useUnreadReplyCount from '../../hooks/use-unread-reply-count';
import useUpvote from '../../hooks/use-upvote';
import useDownvote from '../../hooks/use-downvote';
import useRepliesSortType from '../../hooks/use-replies-sort-type';
import useCommentLabels from '../../hooks/use-comment-labels';
import useStateString from '../../hooks/use-state-string';
import useVerbose from '../../hooks/use-verbose';
import useInspectedComment, { isSameComment } from '../../hooks/use-inspected-comment';
import useInspectorAvailable from '../../hooks/use-inspector-available';
import useTippingConfig from '../../hooks/use-tipping-config';
import type { TippingConfig } from '../../lib/tipping';
import styles from './post.module.css';

interface ReplyQuoteProps {
  commentCid?: string;
}

// in flat reply sorts, the reply being answered, cut to 60 chars until clicked
const ReplyQuote = ({ commentCid }: ReplyQuoteProps) => {
  const comment = useComment({ commentCid, onlyIfCached: true });
  const { shortAuthorAddress } = useAuthorAddress({ comment });
  const [isOpen, setIsOpen] = useState(false);
  const content: string | undefined = comment?.content?.trim?.();
  if (!content) {
    return null;
  }
  const tooLong = content.length > 60;
  return (
    <blockquote className={styles.quote}>
      <span className={styles.dim}>u/{shortAuthorAddress}: </span>
      {isOpen || !tooLong ? content : `${content.substring(0, 60).trim()}…`}
      {tooLong && !isOpen && (
        <button type='button' className={styles.linkButton} onClick={() => setIsOpen(true)}>
          [+]
        </button>
      )}
    </blockquote>
  );
};

interface ReplyProps {
  reply: Comment;
  updatedReply?: Comment;
  // the community's tipping/v1 options, read once by the post and handed down the thread
  tippingConfig?: TippingConfig;
}

const Reply = ({ reply, updatedReply, tippingConfig }: ReplyProps) => {
  // handle pending mod or author edit
  const { state: editedReplyState, editedComment: editedReply } = useEditedComment({ comment: reply });
  if (editedReply) {
    reply = editedReply;
  }

  // show the unverified author address for a few ms until the verified arrives
  const { shortAuthorAddress } = useAuthorAddress({ comment: reply });
  const { useRepliesOptions } = useRepliesSortType();
  const { replies, bufferedReplies, updatedReplies, loadMore, hasMore } = useReplies({ ...useRepliesOptions, comment: reply });

  // publishing states exist only on account comments
  const accountReply = useAccountComment({ commentIndex: reply.index });
  const state = accountReply?.state === 'pending' || accountReply?.state === 'failed' ? accountReply?.state : undefined;
  const publishingStateString = useStateString(state === 'pending' && accountReply);

  const labels = useCommentLabels(reply, editedReplyState);
  const [verbose] = useVerbose();
  const [inspectedComment, setInspectedComment] = useInspectedComment();
  // without the inspector pane on screen, a click would select a reply nothing shows
  const inspectorAvailable = useInspectorAvailable();
  const inspected = inspectorAvailable && isSameComment(inspectedComment, reply);
  const inspect = () => setInspectedComment(updatedReply || reply);

  const score = (updatedReply?.upvoteCount || 0) - (updatedReply?.downvoteCount || 0);
  const loadNewReplies = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    loadMore();
  };

  return (
    <div className={styles.reply}>
      {/* the click is a mouse shortcut, the inspect button is the keyboard path */}
      <div className={[styles.replyBody, inspected ? styles.inspected : undefined].join(' ')} onClick={inspectorAvailable ? inspect : undefined}>
        <div className={styles.replyHeader}>
          <span className={score < 0 ? styles.negative : score > 0 ? styles.positive : styles.dim}>{score > 0 ? `+${score}` : score}</span>
          <Link to={`/author/${reply?.author?.address}/comment/${reply?.cid}`} className={styles.author}>
            u/{shortAuthorAddress}
          </Link>
          <span className={styles.dim}>{utils.getFormattedTime(reply?.timestamp)}</span>
          {labels.map((label) => (
            <span key={label} className={styles.label}>
              {label}
            </span>
          ))}
          {state && <span className={styles.label}>{state}</span>}
          {publishingStateString && <span className={styles.dim}>{publishingStateString}</span>}
          {/* the tip this reply carries, and what its own replies tipped it */}
          <TipLine comment={reply} updatedComment={updatedReply} />
          <TipTotals comment={reply} replies={replies} updatedReplies={updatedReplies} />
          <ReplyTools reply={reply}>
            <span className={styles.linkButton}>reply</span>
          </ReplyTools>
          <TipTools comment={reply} config={tippingConfig} />
          <button type='button' className={[styles.linkButton, styles.inspect].join(' ')} onClick={inspect}>
            inspect
          </button>
          {hasMore && bufferedReplies?.length !== 0 && (
            <button type='button' className={styles.linkButton} onClick={loadNewReplies}>
              {bufferedReplies?.length} new {bufferedReplies.length === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>
        {useRepliesOptions.flat && reply.depth > 1 && <ReplyQuote commentCid={reply.parentCid} />}
        <div className={styles.replyContent}>{reply?.content?.trim?.()}</div>
        {/* a link that is not media has no [+] toggle, so its host is the only way to reach it */}
        {reply?.link && (
          <a href={reply.link} target='_blank' rel='noreferrer' className={styles.replyLink}>
            {utils.getHost(reply.link)}
          </a>
        )}
        <CommentMedia comment={reply} />
        {verbose && <CommentLine comment={reply} updatedComment={updatedReply} />}
      </div>
      {replies.length > 0 && (
        <div className={styles.children}>
          {replies.map((childReply, index) => (
            <Reply key={childReply?.index || childReply?.cid} reply={childReply} updatedReply={updatedReplies[index]} tippingConfig={tippingConfig} />
          ))}
        </div>
      )}
    </div>
  );
};

function Post() {
  const { commentCid, communityAddress } = useParams<{ communityAddress?: string; commentCid?: string }>();
  let post: Comment = useComment({ commentCid });

  // handle pending mod or author edit
  const { state: editedPostState, editedComment: editedPost } = useEditedComment({ comment: post });
  if (editedPost) {
    post = editedPost;
  }

  const { repliesSortType, repliesSortTypes, setRepliesSortType, useRepliesOptions } = useRepliesSortType();
  const { replies, bufferedReplies, updatedReplies, hasMore, loadMore } = useReplies({ ...useRepliesOptions, comment: post });
  const { blocked: hidden } = useBlock({ cid: post?.cid });
  const [upvoted, upvote] = useUpvote(post);
  const [downvoted, downvote] = useDownvote(post);
  // show the unverified author address for a few ms until the verified arrives
  const { shortAuthorAddress } = useAuthorAddress({ comment: post });
  const labels = useCommentLabels(post, editedPostState);
  const stateString = useStateString(post);
  const [verbose] = useVerbose();
  const tippingConfig = useTippingConfig(communityAddress);

  // keep track of unread reply counts
  const [, setRepliesToRead] = useUnreadReplyCount(post);
  useEffect(() => {
    setRepliesToRead();
  }, [post?.replyCount, setRepliesToRead]);

  // scroll to top on first load
  // braces matter: window.scrollTo returns a Promise in current Chrome, and an effect that returns one breaks unmount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // redirect to parent post if any
  const navigate = useNavigate();
  useEffect(() => {
    if (post?.postCid && post?.postCid !== post?.cid) {
      navigate(`/${post?.communityAddress}/comment/${post?.postCid}`, { replace: true });
    }
  }, [post?.postCid, post?.communityAddress, post?.cid, navigate]);

  // invalid community
  if (post?.communityAddress && communityAddress !== post?.communityAddress) {
    return 'wrong community address';
  }

  // useComment always returns an object (state, refresh, errors...), so a loaded field tells a fetched post apart
  const loaded = Boolean(post?.timestamp);
  const score = (post?.upvoteCount || 0) - (post?.downvoteCount || 0);
  const host = post?.link ? utils.getHost(post.link) : '';

  return (
    <Panes
      aside={<CommunityInfo communityAddress={communityAddress} />}
      asideTitle={communityAddress}
      inspector={<Inspector defaultComment={loaded ? post : undefined} fallback={<p>loading the post...</p>} />}
    >
      <article className={[styles.post, hidden ? styles.hidden : undefined].join(' ')}>
        <div className={styles.postHeader}>
          <div className={styles.score}>
            <button type='button' className={[styles.vote, upvoted ? styles.voted : undefined].join(' ')} onClick={upvote} aria-label='upvote' aria-pressed={upvoted}>
              <Arrow />
            </button>
            <PostTools post={post}>
              <span className={[styles.scoreNumber, score < 0 ? styles.negative : undefined].join(' ')} title='post tools'>
                {loaded ? score : '-'}
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
          <div className={styles.headerBody}>
            <h1 className={styles.title}>{post?.title?.trim?.() || (loaded ? '-' : 'loading...')}</h1>
            <div className={styles.meta}>
              {labels.map((label) => (
                <span key={label} className={styles.label}>
                  {label}
                </span>
              ))}
              {loaded && (
                <>
                  {utils.getFormattedTime(post.timestamp)} by <Link to={`/author/${post.author?.address}/comment/${post.cid}`}>u/{shortAuthorAddress}</Link> to{' '}
                  <Link to={`/${post.communityAddress}`}>{post.shortCommunityAddress || post.communityAddress}</Link>
                </>
              )}
              {host && (
                <a href={post?.link} target='_blank' rel='noreferrer' className={styles.host}>
                  {host}
                </a>
              )}
            </div>
          </div>
        </div>
        <div className={styles.postBody}>
          {post?.content?.trim?.() && <div className={styles.content}>{post.content.trim()}</div>}
          <CommentMedia comment={post} defaultOpen={true} />
          {verbose && <CommentLine comment={post} />}
          <div className={styles.actions}>
            <span>{post?.replyCount ?? 0} comments</span>
            <label>
              <span className={styles.dim}>sort </span>
              <select onChange={(event) => setRepliesSortType(event.target.value)} value={repliesSortType} className={styles.select}>
                {repliesSortTypes.map((sortType) => (
                  <option key={sortType} value={sortType}>
                    {sortType}
                  </option>
                ))}
              </select>
            </label>
            <PostReplyTools reply={post}>
              <span className={styles.linkButton}>reply</span>
            </PostReplyTools>
            <TipTotals comment={post} replies={replies} updatedReplies={updatedReplies} />
            <TipTools comment={post} config={tippingConfig} />
          </div>
          {stateString && <div className={styles.stateString}>{stateString}</div>}
        </div>
      </article>
      <div className={styles.replies}>
        {replies.map((reply, index) => (
          <Reply key={reply?.index || reply?.cid} reply={reply} updatedReply={updatedReplies[index]} tippingConfig={tippingConfig} />
        ))}
      </div>
      {hasMore && bufferedReplies?.length !== 0 && (
        <button type='button' className={[styles.linkButton, styles.loadMore].join(' ')} onClick={loadMore}>
          load more comments ({bufferedReplies?.length})
        </button>
      )}
    </Panes>
  );
}

export default Post;
