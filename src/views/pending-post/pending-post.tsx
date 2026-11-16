import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAccountComment, useAuthorAddress } from '@bitsocial/bitsocial-react-hooks';
import utils from '../../lib/utils';
import Panes from '../../components/panes';
import Inspector from '../../components/inspector';
import CommunityInfo from '../../components/community-info';
import CommentMedia from '../../components/comment-media';
import { CommentLine } from '../../components/protocol-details';
import { useAccountCommentIndexAfterDeletes } from '../../hooks/use-publish-comment-with-abandon';
import useStateString from '../../hooks/use-state-string';
import useVerbose from '../../hooks/use-verbose';
import styles from '../post/post.module.css';

// the account's own post while it publishes, at /profile/<account comment index>, laid out like a post page
function PendingPost() {
  const { accountCommentIndex } = useParams();
  const navigate = useNavigate();
  // a cancelled challenge deletes its pending comment and moves the account's later comments down one slot
  const commentIndex = useAccountCommentIndexAfterDeletes(accountCommentIndex);
  const post = useAccountComment({ commentIndex });
  const { shortAuthorAddress } = useAuthorAddress({ comment: post });
  const publishingStateString = useStateString(post);
  const [verbose] = useVerbose();

  // scroll to top on first load
  // braces matter: window.scrollTo returns a Promise in current Chrome, and an effect that returns one breaks unmount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // redirect to post when post.cid is received, or to parent post if post is a reply
  useEffect(() => {
    if (post?.cid && post?.communityAddress) {
      navigate(`/${post?.communityAddress}/comment/${post?.cid}`, { replace: true });
    }
    // post is not a post, is a reply, redirect to post
    else if (post?.parentCid && post?.communityAddress) {
      navigate(`/${post?.communityAddress}/comment/${post?.parentCid}`, { replace: true });
    }
  }, [post?.cid, post?.communityAddress, navigate, post?.parentCid]);

  // the library marks a comment without cid failed on a publish error or after 20 minutes
  const state = post?.state === 'pending' || post?.state === 'failed' ? post.state : undefined;
  const host = post?.link ? utils.getHost(post.link) : '';

  // the account comment loads from the database after the page, or the index points past the account's comments
  if (!post?.timestamp) {
    return <p>loading account comment #{accountCommentIndex}...</p>;
  }

  return (
    <Panes
      aside={post?.communityAddress ? <CommunityInfo communityAddress={post.communityAddress} /> : undefined}
      asideTitle={post?.communityAddress}
      inspector={<Inspector defaultComment={post} />}
    >
      <article className={styles.post}>
        <div className={styles.postHeader}>
          {/* a pending post can't be voted on yet */}
          <div className={styles.score}>
            <span className={styles.scoreNumber}>0</span>
          </div>
          <div className={styles.headerBody}>
            <h1 className={styles.title}>{post?.title?.trim?.() || '-'}</h1>
            <div className={styles.meta}>
              {state && <span className={[styles.label, state === 'failed' ? styles.negative : styles.pending].join(' ')}>{state}</span>}
              {utils.getFormattedTime(post?.timestamp)} by <Link to='/profile'>u/{shortAuthorAddress}</Link> to{' '}
              <Link to={`/${post?.communityAddress}`}>{post?.communityAddress}</Link>
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
            <span>0 comments</span>
          </div>
          {publishingStateString && <div className={styles.stateString}>{publishingStateString}</div>}
        </div>
      </article>
    </Panes>
  );
}

export default PendingPost;
