import utils, { type CommentMediaType } from '../../lib/utils';
import { Link } from 'react-router-dom';
import { flattenCommentsPages } from '@bitsocial/bitsocial-react-hooks/dist/lib/utils/index.js';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { useMemo } from 'react';
import styles from './board-post.module.css';

interface BoardPostMediaProps {
  mediaType: CommentMediaType | undefined;
  mediaUrl?: string;
}

const BoardPostMedia = ({ mediaType, mediaUrl }: BoardPostMediaProps) => {
  if (!mediaType) {
    return <div className={styles.noMedia}></div>;
  }
  if (mediaType === 'image') {
    return (
      <div className={styles.mediaWrapper}>
        <img className={styles.media} src={mediaUrl} alt='' />
      </div>
    );
  }
  if (mediaType === 'video') {
    return (
      <div className={styles.mediaWrapper}>
        <video className={styles.media} controls={true} autoPlay={false} src={mediaUrl} />
      </div>
    );
  }
  return <div className={styles.noMedia}></div>;
};

interface ReplyProps {
  reply: Comment;
}

const Reply = ({ reply }: ReplyProps) => {
  return (
    <div className={styles.reply}>
      <div className={styles.replyHeaderWrapper}>
        <div className={styles.replyHeader}>
          <span className={styles.replyAuthor}>{reply.author.shortAddress}</span>
          <span className={styles.replyTimestamp}> {utils.getFormattedTime(reply?.timestamp)}</span>
        </div>
      </div>

      <div className={styles.replyContent}>{reply.content}</div>
    </div>
  );
};

interface BoardPostProps {
  post: Comment;
  index?: number;
}

const BoardPost = ({ post, index }: BoardPostProps) => {
  const mediaType = utils.getCommentMediaType(post);

  const internalLink = `/p/${post.communityAddress}/c/${post.cid}`;
  const externalLink = !mediaType && post?.link && <Link to={post?.link}>{post?.link}</Link>;

  const replies = useMemo(
    () =>
      flattenCommentsPages(post.replies)
        .splice(0, 5)
        .map((reply: Comment) => <Reply reply={reply} />),
    [post.replies],
  );

  return (
    <div className={styles.post}>
      <Link to={internalLink}>
        <BoardPostMedia mediaType={mediaType} mediaUrl={post?.link} />
      </Link>
      <div className={styles.textWrapper}>
        <div className={styles.header}>
          <Link to={internalLink} className={styles.title}>
            {post?.title || '-'}
          </Link>
          <span className={styles.timestamp}> {utils.getFormattedTime(post?.timestamp)}</span>
          <span className={styles.author}> by {post?.author?.shortAddress}</span>
          <span className={styles.community}> to {post?.shortCommunityAddress}</span>
        </div>
        <div className={styles.content}>
          {externalLink}
          <Link to={internalLink}>{post?.content || ''}</Link>
        </div>
        <div className={styles.footer}>
          <Link to={internalLink} className={styles.replyCount}>
            {post?.replyCount} comments
          </Link>
        </div>
      </div>
      {replies}
    </div>
  );
};

export default BoardPost;
