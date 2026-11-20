import { useRef, useEffect } from 'react';
import { useFeed, useAccount } from '@bitsocial/bitsocial-react-hooks';
import { Virtuoso } from 'react-virtuoso';
import type { StateSnapshot, VirtuosoHandle } from 'react-virtuoso';
import FeedPost from '../../components/feed-post';
import { FeedDetails } from '../../components/protocol-details';
import Panes from '../../components/panes';
import Inspector from '../../components/inspector';
import CommunitiesPane from '../../components/communities-pane';
import FeedHeader, { FeedFooter } from '../../components/feed-header';
import { useParams } from 'react-router-dom';
import useFeedStateString from '../../hooks/use-feed-state-string';
import useTimeFilter from '../../hooks/use-time-filter';
import { useCommunityIdentifiers } from '../../hooks/use-community-identifier';

const lastVirtuosoStates: Record<string, StateSnapshot> = {};

const NoSubscriptions = () => <FeedFooter>no subscriptions, join communities from their page</FeedFooter>;
const NoPosts = () => <FeedFooter>no posts</FeedFooter>;

// show own pending posts at the top for 12 hours
const accountComments = { newerThan: 60 * 60 * 12 };

function Subscriptions() {
  const params = useParams<{ sortType?: string; timeFilterName?: string }>();
  const account = useAccount();
  const communityAddresses = account?.subscriptions;
  const subscriptionAddresses: string[] = communityAddresses || [];
  const sortType = params?.sortType || 'hot';
  const { timeFilterSeconds, timeFilterNames } = useTimeFilter();
  const timeFilterName = params?.timeFilterName || timeFilterNames[0];
  const communities = useCommunityIdentifiers(communityAddresses);
  const feedResult = useFeed({ communities, sortType, postsPerPage: 10, newerThan: timeFilterSeconds, accountComments });
  const { feed, updatedFeed, hasMore, loadMore } = feedResult;
  const loadingStateString = useFeedStateString(communityAddresses) || 'loading...';

  let Footer;
  if (feed?.length === 0) {
    Footer = NoPosts;
  }
  if (communityAddresses?.length === 0) {
    Footer = NoSubscriptions;
  }
  if (hasMore || !account) {
    Footer = () => <FeedFooter>{loadingStateString}</FeedFooter>;
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

  // the 'all' time filter leaves newerThan out of the call
  const hookCall = `useFeed({\n  communities: [${communities.length}],\n  sortType: '${sortType}',\n  postsPerPage: 10${timeFilterSeconds ? `,\n  newerThan: ${timeFilterSeconds}` : ''}\n})`;

  return (
    <Panes
      aside={<CommunitiesPane communityAddresses={subscriptionAddresses} hookCall={hookCall} />}
      asideTitle={`communities (${subscriptionAddresses.length})`}
      inspector={
        <Inspector
          fallback={
            <FeedDetails feedResult={feedResult} communityCount={communities.length} sortType={sortType} newerThan={timeFilterSeconds} stateString={loadingStateString} />
          }
        />
      }
    >
      <FeedHeader feedResult={feedResult} sortType={sortType} timeFilterName={timeFilterName} stateString={loadingStateString} />
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

export default Subscriptions;
