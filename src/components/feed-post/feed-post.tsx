import utils from '../../lib/utils';
import { Link } from 'react-router-dom';
import styles from './feed-post.module.css';
import Arrow from '../icons/arrow';
import PostTools from '../post-tools';
import { useBlock, useAuthorAddress, useEditedComment, useCommunity, useAuthorAvatar } from '@bitsocial/bitsocial-react-hooks';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import useUnreadReplyCount from '../../hooks/use-unread-reply-count';
import useUpvote from '../../hooks/use-upvote';
import useDownvote from '../../hooks/use-downvote';
import useCommentLabels from '../../hooks/use-comment-labels';
import { useCommunityIdentifier } from '../../hooks/use-community-identifier';

// the media type union returned by utils.getCommentMediaType is not exported, so derive it here
type MediaType = ReturnType<typeof utils.getCommentMediaType>;

interface FeedPostMediaProps {
  mediaType: MediaType;
  mediaUrl?: string;
  link: string;
}

const FeedPostMedia = ({ mediaType, mediaUrl, link }: FeedPostMediaProps) => {
  if (!mediaType) {
    return <div className={styles.noMedia}></div>;
  }
  if (mediaType === 'image') {
    return (
      <div className={styles.mediaWrapper}>
        <Link to={link}>
          <img className={styles.media} src={mediaUrl} alt='' />
        </Link>
      </div>
    );
  }
  if (mediaType === 'video') {
    return (
      <div className={styles.mediaWrapper}>
        <Link to={link}>
          <video className={styles.media} controls={true} autoPlay={false} src={mediaUrl} />
        </Link>
      </div>
    );
  }
  if (mediaType === 'audio') {
    return (
      <Link to={link}>
        <audio controls={true} autoPlay={false} src={mediaUrl} />
      </Link>
    );
  }
  return <div className={styles.noMedia}></div>;
};

interface FeedPostAuthorAddressProps {
  post?: Comment;
}

const FeedPostAuthorAddress = ({ post }: FeedPostAuthorAddressProps) => {
  // show the public key author address for a few ms until the crypto name verification loads
  const { shortAuthorAddress, authorAddressChanged } = useAuthorAddress({ comment: post });

  return (
    <Link className={styles.authorAddressWrapper} to={`/u/${post?.author?.address}/c/${post?.cid}`}>
      {/* use the crypto name as the width of the html element, but hide it and display the verified author address instead */}
      <span className={styles.authorAddressHidden}>{post?.author?.shortAddress}</span>
      {/* add css animation if the author address changed */}
      <span className={[styles.authorAddressVisible, authorAddressChanged ? styles.authorAddressChanged : undefined].join(' ')}>{shortAuthorAddress}</span>
    </Link>
  );
};

interface FeedPostAuthorAvatarProps {
  post?: Comment;
}

const FeedPostAuthorAvatar = ({ post }: FeedPostAuthorAvatarProps) => {
  const { imageUrl } = useAuthorAvatar({ author: post?.author });
  // if comment.author.avatar is defined, load empty space even without imageUrl
  // to not displace the feed after image loads
  if (!post?.author?.avatar) {
    return;
  }
  return (
    <span className={styles.authorAvatarWrapper}>
      <img className={styles.authorAvatar} alt='' src={imageUrl} />
    </span>
  );
};

interface FeedPostProps {
  // useAuthorComments hands back (Comment | undefined)[], and every read below is optional chained
  post?: Comment;
  updatedPost?: Comment;
  index?: number;
}

const FeedPost = ({ post, updatedPost, index }: FeedPostProps) => {
  if (!updatedPost) {
    updatedPost = post;
  }

  // handle pending mod or author edit
  const { state: editedPostState, editedComment: editedPost } = useEditedComment({ comment: post });
  if (editedPost) {
    post = editedPost;
  }

  let hostname;
  try {
    hostname = new URL(post?.link).hostname.replace(/^www\./, '');
  } catch (e) {}

  const mediaType = utils.getCommentMediaType(post);

  let internalLink = `/p/${post?.communityAddress}/c/${post?.cid}`;
  // post is pending
  if (!post?.cid && post?.index !== undefined) {
    internalLink = `/profile/${post?.index}`;
  }

  const { blocked: hidden } = useBlock({ cid: post?.cid });

  const [unreadReplyCount] = useUnreadReplyCount(updatedPost);
  const unreadReplyCountText = typeof unreadReplyCount === 'number' ? `+${unreadReplyCount}` : '';

  const [upvoted, upvote] = useUpvote(post);
  const [downvoted, downvote] = useDownvote(post);

  // widened because the block below swaps in the '-' placeholder when the counts are missing
  let scoreNumber: number | string = updatedPost?.upvoteCount - updatedPost?.downvoteCount;
  const negativeScoreNumber = scoreNumber < 0;
  const largeScoreNumber = String(scoreNumber).length > 3;
  if (isNaN(scoreNumber)) {
    scoreNumber = '-';
  }

  const labels = useCommentLabels(updatedPost, editedPostState);

  const title = (post?.title?.trim?.() || post?.content?.trim?.())?.substring?.(0, 300) || '-';

  // if sub address is not a domain, add sub title hint to address
  const communityAddressIsDomain = post?.shortCommunityAddress && post?.shortCommunityAddress?.includes('.');
  const communityIdentifier = useCommunityIdentifier(!communityAddressIsDomain ? post?.communityAddress : undefined);
  const community = useCommunity(communityIdentifier ? { community: communityIdentifier } : undefined);
  const communityAddress = community?.title
    ? `${post?.shortCommunityAddress.substring(0, 8)}-${community?.title?.replaceAll(' ', '').substring(0, 8).toLowerCase()}`
    : post?.shortCommunityAddress;

  return (
    <div className={styles.feedPost}>
      <div className={styles.textWrapper}>
        <div className={styles.column}>
          <div className={styles.score}>
            <div onClick={upvote} className={[styles.upvote, upvoted ? styles.voteSelected : undefined].join(' ')}>
              <Arrow />
            </div>
            <PostTools post={post}>
              <div
                className={[
                  styles.scoreNumber,
                  largeScoreNumber ? styles.largeScoreNumber : undefined,
                  negativeScoreNumber ? styles.negativeScoreNumber : undefined,
                ].join(' ')}
              >
                {scoreNumber}
              </div>
            </PostTools>
            <div onClick={downvote} className={[styles.downvote, downvoted ? styles.voteSelected : undefined].join(' ')}>
              <Arrow />
            </div>
          </div>
        </div>
        <div className={[styles.column, hidden ? styles.hidden : undefined].join(' ')}>
          <div className={styles.header}>
            <Link to={internalLink} className={styles.title}>
              {title}
            </Link>
            {labels.map((label) => (
              <>
                {' '}
                <span key={label} className={styles.label}>
                  {label}
                </span>
              </>
            ))}
            {hostname && (
              <Link to={post?.link} target='_blank' rel='noreferrer'>
                {' '}
                {hostname}
              </Link>
            )}
          </div>
          <div className={styles.content}>
            <span className={styles.timestamp}>{utils.getFormattedTime(post?.timestamp)}</span>
            <span className={styles.author}>
              {' '}
              by <FeedPostAuthorAvatar post={post} />
              <FeedPostAuthorAddress post={post} /> to{' '}
            </span>
            <Link to={`/p/${post?.communityAddress}`} className={styles.community}>
              {communityAddress}
            </Link>
          </div>
          <div className={styles.footer}>
            <Link to={internalLink} className={[styles.button, styles.replyCount].join(' ')}>
              {updatedPost?.replyCount || 0} comments <span className={styles.unreadReplyCount}>{unreadReplyCountText}</span>
            </Link>
          </div>
        </div>
      </div>
      <div className={hidden || post?.removed ? styles.hidden : undefined}>
        <FeedPostMedia mediaType={mediaType} mediaUrl={post?.link} link={internalLink} />
      </div>
    </div>
  );
};

export default FeedPost;
