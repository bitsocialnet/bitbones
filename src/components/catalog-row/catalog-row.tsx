import { Link } from 'react-router-dom';
import utils from '../../lib/utils';
import styles from './catalog-row.module.css';
import useUnreadReplyCount from '../../hooks/use-unread-reply-count';
import PostTools from '../post-tools';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';

// column width in px
const columnWidth = 180;

const getCatalogPostMediaDimensions = (post?: Comment) => {
  if (post?.linkWidth && post?.linkHeight && typeof post?.linkWidth === 'number' && typeof post?.linkHeight === 'number' && post?.linkWidth !== post?.linkHeight) {
    if (post?.linkWidth > post?.linkHeight) {
      return { width: columnWidth, height: Math.round((post?.linkHeight / post?.linkWidth) * columnWidth) };
    } else {
      return { width: Math.round((post?.linkWidth / post?.linkHeight) * columnWidth), height: columnWidth };
    }
  }
};

interface CatalogPostMediaProps {
  post?: Comment;
}

const CatalogPostMedia = ({ post }: CatalogPostMediaProps) => {
  const mediaType = utils.getCommentMediaType(post);
  if (!mediaType) {
    return <div className={styles.noMedia}></div>;
  }
  const style = getCatalogPostMediaDimensions(post);
  if (mediaType === 'image') {
    return (
      <div style={style} className={styles.mediaWrapper}>
        <img style={style} className={styles.media} src={post?.link} alt='' />
      </div>
    );
  }
  if (mediaType === 'video') {
    return (
      <div style={style} className={styles.mediaWrapper}>
        <video style={style} className={styles.media} controls={true} autoPlay={false} src={post?.link} />
      </div>
    );
  }
  return <div className={styles.noMedia}></div>;
};

interface CatalogPostProps {
  post?: Comment;
}

const CatalogPost = ({ post }: CatalogPostProps) => {
  const internalLink = `/p/${post?.communityAddress}/c/${post?.cid}`;

  let title = post?.title || '';
  const content = post?.content || '';
  if (title && content) {
    title += ': ';
  }
  title += content;
  title = title.replace(/\n/g, '').substring(0, 100) || '-';

  const [unreadReplyCount] = useUnreadReplyCount(post);
  const unreadReplyCountText = typeof unreadReplyCount === 'number' ? `+${unreadReplyCount}` : '';

  // TODO: count images in replies as R: ${replyCount} / I: ${imageCount}
  const stats = `R: ${post?.replyCount}`;

  return (
    <div className={styles.post}>
      <div>
        <Link to={internalLink}>
          <CatalogPostMedia post={post} />
        </Link>
      </div>
      <PostTools post={post}>
        <div className={styles.postHeader}>
          <span className={styles.postStats}>{stats}</span>
          <span className={styles.unreadReplyCount}>{unreadReplyCountText}</span>
        </div>
      </PostTools>
      <div className={styles.postTitle}>
        <Link to={internalLink}>{title}</Link>
      </div>
    </div>
  );
};

interface CatalogRowProps {
  row: Comment[];
  // supplied by react-virtuoso's itemContent, unused by the row itself
  index?: number;
}

const CatalogRow = ({ row }: CatalogRowProps) => {
  const posts = [];
  for (const post of row) {
    posts.push(<CatalogPost key={post?.cid} post={post} />);
  }
  return <div className={styles.row}>{posts}</div>;
};

export default CatalogRow;
