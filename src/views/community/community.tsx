import { useMemo, useRef, useEffect } from 'react';
import { useFeed } from '@bitsocial/bitsocial-react-hooks';
import { Virtuoso } from 'react-virtuoso';
import type { Components, StateSnapshot, VirtuosoHandle } from 'react-virtuoso';
import { useParams } from 'react-router-dom';
import FeedPost from '../../components/feed-post';
import { FeedDetails } from '../../components/protocol-details';
import Panes from '../../components/panes';
import Inspector from '../../components/inspector';
import CommunityInfo from '../../components/community-info';
import FeedHeader, { FeedFooter } from '../../components/feed-header';
import useFeedStateString from '../../hooks/use-feed-state-string';
import useTimeFilter from '../../hooks/use-time-filter';
import { useCommunityIdentifiers } from '../../hooks/use-community-identifier';

const lastVirtuosoStates: Record<string, Record<string, StateSnapshot>> = {};

const NoPosts = () => <FeedFooter>no posts</FeedFooter>;

// show own pending posts at the top for 12 hours
const accountComments = { newerThan: 60 * 60 * 12 };

function Community() {
  const params = useParams<{ communityAddress?: string; sortType?: string; timeFilterName?: string }>();
  // the /:communityAddress route always sets the param, react-router types every route param as optional
  const communityAddress = params.communityAddress!;
  const communityAddresses = useMemo(() => [communityAddress], [communityAddress]);
  const sortType = params?.sortType || 'hot';
  const { timeFilterSeconds } = useTimeFilter();
  // single community feeds only need the time filter for sort types top and controversial
  const newerThan = sortType === 'topAll' || sortType === 'controversialAll' ? timeFilterSeconds : undefined;
  const communities = useCommunityIdentifiers(communityAddresses);
  const feedResult = useFeed({ communities, sortType, newerThan, accountComments });
  const { feed, updatedFeed, hasMore, loadMore } = feedResult;
  const { stateString, failed } = useFeedStateString(communityAddresses, feedResult.state);

  let Footer: Components['Footer'];
  if (feed?.length === 0) {
    Footer = NoPosts;
  }
  if (hasMore) {
    Footer = () => <FeedFooter failed={failed}>{stateString}</FeedFooter>;
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
    <Panes
      aside={<CommunityInfo communityAddress={communityAddress} />}
      asideTitle={communityAddress}
      inspector={<Inspector fallback={<FeedDetails feedResult={feedResult} communityCount={1} sortType={sortType} newerThan={newerThan} stateString={stateString} />} />}
    >
      <FeedHeader feedResult={feedResult} sortType={sortType} timeFilterName={newerThan ? params.timeFilterName : undefined} stateString={stateString} failed={failed} />
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
    </Panes>
  );
}

export default Community;
