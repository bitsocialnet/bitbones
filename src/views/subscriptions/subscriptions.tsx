import { useRef, useEffect } from 'react';
import { useFeed, useAccount } from '@bitsocial/bitsocial-react-hooks';
import type { FeedResult } from '../../lib/feed-result';
import { Virtuoso } from 'react-virtuoso';
import type { StateSnapshot, VirtuosoHandle } from 'react-virtuoso';
import FeedPost from '../../components/feed-post';
import { useParams } from 'react-router-dom';
import useFeedStateString from '../../hooks/use-feed-state-string';
import useTimeFilter from '../../hooks/use-time-filter';
import { useCommunityIdentifiers } from '../../hooks/use-community-identifier';

const lastVirtuosoStates: Record<string, StateSnapshot> = {};

const NoSubscriptions = () => 'no subscriptions';
const NoPosts = () => 'no posts';

// show own pending posts at the top for 12 hours
const accountComments = { newerThan: 60 * 60 * 12 };

function Subscriptions() {
  const params = useParams<{ sortType?: string }>();
  const account = useAccount();
  const communityAddresses = account?.subscriptions;
  const sortType = params?.sortType || 'hot';
  const { timeFilterSeconds } = useTimeFilter();
  const communities = useCommunityIdentifiers(communityAddresses);
  const { feed, updatedFeed, hasMore, loadMore } = useFeed({ communities, sortType, postsPerPage: 10, newerThan: timeFilterSeconds, accountComments }) as FeedResult;
  const loadingStateString = useFeedStateString(communityAddresses) || 'loading...';

  let Footer;
  if (feed?.length === 0) {
    Footer = NoPosts;
  }
  if (communityAddresses?.length === 0) {
    Footer = NoSubscriptions;
  }
  if (hasMore || !account) {
    Footer = () => loadingStateString;
  }

  // save last virtuoso state on each scroll
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  useEffect(() => {
    const setLastVirtuosoState = () =>
      virtuosoRef.current?.getState((snapshot) => {
        // TODO: not sure if checking for empty snapshot.ranges works for all scenarios
        if (snapshot?.ranges?.length) {
          lastVirtuosoStates[sortType] = snapshot;
        }
      });
    window.addEventListener('scroll', setLastVirtuosoState);
    // clean listener on unmount
    return () => window.removeEventListener('scroll', setLastVirtuosoState);
  }, [sortType]);
  const lastVirtuosoState = lastVirtuosoStates?.[sortType];

  return (
    <div>
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

export default Subscriptions;
