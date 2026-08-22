import utils from '../../lib/utils';
import { useParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Arrow from '../../components/icons/arrow';
import styles from '../post/post.module.css';
import { useAccountComment, useAuthorAddress } from '@bitsocial/bitsocial-react-hooks';
import type { Comment, UseAccountCommentOptions } from '@bitsocial/bitsocial-react-hooks';
import useStateString from '../../hooks/use-state-string';
import Embed, { canEmbed } from '../../components/embed';

interface PostMediaProps {
  post?: Comment;
}

const PostMedia = ({ post }: PostMediaProps) => {
  if (!post?.link) {
    return <div className={styles.noMedia}></div>;
  }
  const mediaType = utils.getCommentMediaType(post);
  if (mediaType === 'image') {
    return (
      <div className={styles.mediaWrapper}>
        <img className={styles.media} src={post?.link} alt='' />
      </div>
    );
  }
  if (mediaType === 'video') {
    return <video className={styles.media} controls={true} autoPlay={false} src={post?.link} />;
  }
  if (mediaType === 'audio') {
    return <audio className={styles.media} controls={true} autoPlay={false} src={post?.link} />;
  }
  try {
    const parsedUrl = new URL(post?.link);
    if (canEmbed(parsedUrl)) {
      return (
        <div className={styles.mediaWrapper}>
          <Embed parsedUrl={parsedUrl} />
        </div>
      );
    }
  } catch (e) {}
  return <div className={styles.noMedia}></div>;
};

function Post() {
  const { accountCommentIndex: commentIndex } = useParams();
  const navigate = useNavigate();
  // commentIndex is typed number-only, but useAccountComment normalizes it with Number() at
  // runtime, so the string route param it is given here is what the hook expects
  const post = useAccountComment({ commentIndex } as UseAccountCommentOptions);
  const { shortAuthorAddress } = useAuthorAddress({ comment: post });

  let hostname;
  try {
    hostname = new URL(post?.link).hostname.replace(/^www\./, '');
  } catch (e) {}

  // scroll to top on first load
  useEffect(() => window.scrollTo(0, 0), []);

  // redirect to post when post.cid is received, or to parent post if post is a reply
  useEffect(() => {
    if (post?.cid && post?.communityAddress) {
      navigate(`/p/${post?.communityAddress}/c/${post?.cid}`, { replace: true });
    }
    // post is not a post, is a reply, redirect to post
    else if (post?.parentCid && post?.communityAddress) {
      navigate(`/p/${post?.communityAddress}/c/${post?.parentCid}`, { replace: true });
    }
  }, [post?.cid, post?.communityAddress, navigate, post?.parentCid]);

  let state;
  if (post?.timestamp) {
    // if older than 20 minutes without receiving post.cid, consider pending comment failed
    if (post.timestamp > Date.now() / 1000 - 20 * 60) {
      state = 'pending';
    } else {
      state = 'failed';
    }
  }
  const stateStyle = styles[`${state}Label`];

  const publishingStateString = useStateString(post);

  return (
    <div className={styles.post}>
      <div className={styles.textWrapper}>
        <div className={styles.column}>
          <div className={styles.score}>
            <div className={styles.upvote}>
              <Arrow />
            </div>
            <div className={styles.scoreNumber}>0</div>
            <div className={styles.downvote}>
              <Arrow />
            </div>
          </div>
        </div>
        <div className={styles.column}>
          <div className={styles.header}>
            <Link to={post?.link} target={post?.link ? '_blank' : undefined} rel='noreferrer' className={styles.title}>
              {post?.title || '-'}
            </Link>{' '}
            <span className={stateStyle}>{state}</span>
            {hostname && (
              <Link to={post?.link} target='_blank' rel='noreferrer'>
                {' '}
                {hostname}
              </Link>
            )}
          </div>
          <div>
            <span className={styles.timestamp}>{utils.getFormattedTime(post?.timestamp)}</span>
            <span className={styles.author}>
              {' '}
              by <Link to='/profile'>{shortAuthorAddress}</Link> to{' '}
            </span>
            <Link to={`/p/${post?.communityAddress}`} className={styles.community}>
              {post?.communityAddress}
            </Link>
          </div>
          <div className={styles.footer}>
            <span className={[styles.replyCount, styles.button].join(' ')}>0 comments</span>
          </div>
          {post?.content && <div className={styles.content}>{post?.content}</div>}
        </div>
      </div>
      <div className={styles.pendingMedia}>
        <PostMedia post={post} />
      </div>
      {publishingStateString && <div className={styles.stateString}>{publishingStateString}</div>}
    </div>
  );
}

export default Post;
