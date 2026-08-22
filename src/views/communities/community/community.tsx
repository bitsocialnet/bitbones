import { Link } from 'react-router-dom';
import { Fragment } from 'react';
import utils from '../../../lib/utils';
import styles from './community.module.css';
import Arrow from '../../../components/icons/arrow';
import { useBlock, useCommunityStats } from '@bitsocial/bitsocial-react-hooks';
import useUpvote from '../../../hooks/use-upvote';
import useDownvote from '../../../hooks/use-downvote';
import { useCommunityIdentifier } from '../../../hooks/use-community-identifier';

const CommunityMedia = ({ mediaType, mediaUrl, link }) => {
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

const Community = ({ community, index }) => {
  const communityIdentifier = useCommunityIdentifier(community?.address);
  const stats = useCommunityStats(communityIdentifier ? { community: communityIdentifier } : undefined);

  const mediaUrl = community?.suggested?.avatarUrl || community?.suggested?.bannerUrl;
  const mediaType = mediaUrl ? 'image' : undefined;

  const communityLink = `/p/${community?.address}`;
  const communitySettingsLink = `${communityLink}/settings`;

  const { blocked: hidden } = useBlock({ address: community?.address });

  const [upvoted] = useUpvote(community);
  const [downvoted] = useDownvote(community);

  let scoreNumber = community?.upvoteCount - community?.downvoteCount;
  const negativeScoreNumber = scoreNumber < 0;
  const largeScoreNumber = String(scoreNumber).length > 3;
  if (isNaN(scoreNumber)) {
    scoreNumber = '-';
  }

  const labels = [];
  // add created time as a label
  if (community?.createdAt) {
    labels.push(utils.getFormattedTime(community.createdAt).replace(' ago', ''));
  }
  // if you have a role, add it
  if (community?.role?.role) {
    labels.push(community.role.role);
  }

  let communityAddress;
  let title = community?.title?.trim?.()?.substring?.(0, 300);
  if (title) {
    communityAddress = `p/${community?.shortAddress}`;
  } else {
    title = community?.address;
  }

  return (
    <div className={styles.feedPost}>
      <div className={styles.textWrapper}>
        <div className={styles.column}>
          <div className={styles.score}>
            <div className={[styles.upvote, upvoted ? styles.voteSelected : undefined].join(' ')}>
              <Arrow />
            </div>
            <div
              className={[styles.scoreNumber, largeScoreNumber ? styles.largeScoreNumber : undefined, negativeScoreNumber ? styles.negativeScoreNumber : undefined].join(
                ' ',
              )}
            >
              {scoreNumber}
            </div>
            <div className={[styles.downvote, downvoted ? styles.voteSelected : undefined].join(' ')}>
              <Arrow />
            </div>
          </div>
        </div>
        <div className={[styles.secondColumn, hidden ? styles.hidden : undefined].join(' ')}>
          <div className={hidden || community?.removed ? styles.hidden : undefined}>
            <CommunityMedia mediaType={mediaType} mediaUrl={mediaUrl} link={communityLink} />
          </div>
          <div className={styles.header}>
            <Link to={communityLink} className={styles.title}>
              {title}
            </Link>
            {labels.map((label) => (
              <Fragment key={label}>
                {' '}
                <span className={styles.label}>{label}</span>
              </Fragment>
            ))}
            {communityAddress && <Link to={communityLink}> {communityAddress}</Link>}
          </div>
          <div className={styles.content}>{community?.description?.substring?.(0, 300)}</div>
          <div className={styles.footer}>
            <Link to={communityLink} className={[styles.button, styles.replyCount].join(' ')}>
              {stats.allPostCount} posts
            </Link>
            <Link to={communityLink} className={[styles.button, styles.replyCount].join(' ')}>
              {stats.allActiveUserCount} users
            </Link>
            <Link to={communitySettingsLink} className={[styles.button, styles.replyCount].join(' ')}>
              edit
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Community;
