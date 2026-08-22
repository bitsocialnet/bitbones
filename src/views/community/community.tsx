import { useMemo, useRef, useEffect } from 'react';
import { useFeed, useCommunity, useCommunityStats, useSubscribe } from '@bitsocial/bitsocial-react-hooks';
import type { Comment, UseFeedResult } from '@bitsocial/bitsocial-react-hooks';
import { Virtuoso } from 'react-virtuoso';
import type { StateSnapshot, VirtuosoHandle } from 'react-virtuoso';
import FeedPost from '../../components/feed-post';
import { useParams } from 'react-router-dom';
import styles from './community.module.css';
import { Link } from 'react-router-dom';
import useFeedStateString from '../../hooks/use-feed-state-string';
import useTimeFilter from '../../hooks/use-time-filter';
import { useCommunityIdentifiers } from '../../hooks/use-community-identifier';
import { useCommunityIdentifier } from '../../hooks/use-community-identifier';

// created at and by example
// const getCreatedAtAndBy = (community) => {
//   // set created at time
//   let createdAt = ''
//   if (community?.createdAt) {
//     createdAt += utils.getFormattedTime(community?.createdAt)
//   }
//   // set created by
//   if (community?.roles) {
//     for (const authorAddress in community.roles) {
//       if (community.roles[authorAddress]?.role === 'owner') {
//         if (createdAt) {
//           createdAt += ' '
//         }
//         createdAt += `by ${Bitsocial.getShortAddress(authorAddress)}`
//         break
//       }
//     }
//   }
//   if (createdAt) {
//     createdAt = `created ${createdAt}`
//   }
//   return createdAt
// }

interface CommunityInfoProps {
  communityAddress?: string;
}

const CommunityInfo = ({ communityAddress }: CommunityInfoProps) => {
  const communityIdentifier = useCommunityIdentifier(communityAddress);
  const community = useCommunity(communityIdentifier ? { community: communityIdentifier } : undefined);
  const stats = useCommunityStats(communityIdentifier ? { community: communityIdentifier } : undefined);
  const { subscribed, subscribe, unsubscribe } = useSubscribe({ communityAddress });
  const toggleSubscribe = () => (!subscribed ? subscribe() : unsubscribe());

  let description = community?.title || '';
  if (community?.description) {
    if (description) {
      description += ': ';
    }
    description += community?.description || '';
  }
  description = description.trim();

  return (
    <div className={styles.info}>
      <div className={styles.header}>
        <div className={styles.title}>
          <Link title='edit' to={`/p/${communityAddress}/settings`}>
            p/{communityAddress}
          </Link>
          <img alt='' className={styles.avatar} src={community?.suggested?.avatarUrl} />
        </div>
        <div className={styles.stats}>
          <button onClick={toggleSubscribe} className={styles.joinButton}>
            {!subscribed ? 'join' : 'leave'}
          </button>{' '}
          {stats.allActiveUserCount} members
        </div>
        <div className={styles.stats}>{stats.hourActiveUserCount} users here now</div>
      </div>
      {description && <div className={styles.description}>{description}</div>}
      {community.rules && (
        <ol className={styles.rules}>
          {community.rules.map?.((rule: string) => (
            <li>{rule?.trim?.()}</li>
          ))}
        </ol>
      )}
    </div>
  );
};

const lastVirtuosoStates: Record<string, Record<string, StateSnapshot>> = {};

const NoPosts = () => 'no posts';

// show own pending posts at the top for 12 hours
const accountComments = { newerThan: 60 * 60 * 12 };

// useFeed returns updatedFeed at runtime, but the library's UseFeedResult type omits it
type FeedResult = UseFeedResult & { updatedFeed: Comment[] };

function Community() {
  const params = useParams<{ communityAddress?: string; sortType?: string }>();
  // the /p/:communityAddress route always sets the param, react-router types every route param as optional
  const communityAddress = params.communityAddress!;
  const communityAddresses = useMemo(() => [communityAddress], [communityAddress]);
  const sortType = params?.sortType || 'hot';
  const { timeFilterSeconds } = useTimeFilter();
  // single sub feeds only need time filter for sort type top and controversial
  const newerThan = sortType === 'topAll' || sortType === 'controversialAll' ? timeFilterSeconds : undefined;
  const communities = useCommunityIdentifiers(communityAddresses);
  const { feed, updatedFeed, hasMore, loadMore } = useFeed({ communities, sortType, newerThan, accountComments }) as FeedResult;
  const loadingStateString = useFeedStateString(communityAddresses) || 'loading...';

  let Footer;
  if (feed?.length === 0) {
    Footer = NoPosts;
  }
  if (hasMore) {
    Footer = () => loadingStateString;
  }

  // save last virtuoso state on each scroll
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  useEffect(() => {
    const setLastVirtuosoState = () =>
      virtuosoRef.current?.getState((snapshot) => {
        // TODO: not sure if checking for empty snapshot.ranges works for all scenarios
        if (snapshot?.ranges?.length) {
          if (!lastVirtuosoStates[communityAddress]) {
            lastVirtuosoStates[communityAddress] = {};
          }
          lastVirtuosoStates[communityAddress][sortType] = snapshot;
        }
      });
    // TODO: doesn't work if the user hasn't scrolled
    window.addEventListener('scroll', setLastVirtuosoState);
    // clean listener on unmount
    return () => window.removeEventListener('scroll', setLastVirtuosoState);
  }, [communityAddress, sortType]);
  const lastVirtuosoState = lastVirtuosoStates?.[communityAddress]?.[sortType];

  return (
    <div>
      <CommunityInfo communityAddress={communityAddress} />
      <Virtuoso
        increaseViewportBy={{ bottom: 1200, top: 600 }}
        totalCount={feed?.length || 0}
        data={feed}
        itemContent={(index, post) => <FeedPost index={index} post={post} updatedPost={updatedFeed[index]} />}
        useWindowScroll={true}
        components={{ Footer }}
        endReached={loadMore}
        ref={virtuosoRef}
        restoreStateFrom={lastVirtuosoState}
        initialScrollTop={lastVirtuosoState?.scrollTop}
      />
    </div>
  );
}

export default Community;
