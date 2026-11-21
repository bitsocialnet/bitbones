import { useRef, useEffect } from 'react';
import useDefaultCommunityAddresses from '../../hooks/use-default-community-addresses';
import useDefaultList from '../../hooks/use-default-list';
import { useFeed } from '@bitsocial/bitsocial-react-hooks';
import { Virtuoso } from 'react-virtuoso';
import type { Components, StateSnapshot, VirtuosoHandle } from 'react-virtuoso';
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

const NoPosts = () => <FeedFooter>no posts</FeedFooter>;

// show own pending posts at the top for 12 hours
const accountComments = { newerThan: 60 * 60 * 12 };

interface HomeProps {
  // set by the /<sortType> routes, the sort type is a literal path segment there and not a route param
  sortType?: string;
}

function Home({ sortType: sortTypeProp }: HomeProps) {
  const params = useParams();
  const communityAddresses = useDefaultCommunityAddresses();
  const [listSource] = useDefaultList();
  const sortType = sortTypeProp || 'hot';
  const { timeFilterSeconds, timeFilterNames } = useTimeFilter();
  const timeFilterName = params?.timeFilterName || timeFilterNames[0];
  const communities = useCommunityIdentifiers(communityAddresses);
  const feedResult = useFeed({ communities, sortType, postsPerPage: 10, newerThan: timeFilterSeconds, accountComments });
  const { feed, updatedFeed, hasMore, loadMore } = feedResult;
  const { stateString, failed } = useFeedStateString(communityAddresses, feedResult.state);

  let Footer: Components['Footer'];
  if (feed?.length === 0) {
    Footer = NoPosts;
  }
  if (hasMore || communityAddresses.length === 0) {
    Footer = () => <FeedFooter failed={failed}>{stateString}</FeedFooter>;
  }

  // save last virtuoso state on each scroll
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  useEffect(() => {
    const setLastVirtuosoState = () =>
      virtuosoRef.current?.getState((snapshot) => {
        // TODO: not sure if checking for empty snapshot.ranges works for all scenarios
        if (snapshot?.ranges?.length) {
          lastVirtuosoStates[listSource + sortType + timeFilterSeconds] = snapshot;
        }
      });
    window.addEventListener('scroll', setLastVirtuosoState);
    // clean listener on unmount
    return () => window.removeEventListener('scroll', setLastVirtuosoState);
  }, [sortType, timeFilterSeconds, listSource]);
  const lastVirtuosoState = lastVirtuosoStates?.[listSource + sortType + timeFilterSeconds];

  // the 'all' time filter leaves newerThan out of the call
  const hookCall = `useFeed({\n  communities: [${communities.length}],\n  sortType: '${sortType}',\n  postsPerPage: 10${timeFilterSeconds ? `,\n  newerThan: ${timeFilterSeconds}` : ''}\n})`;

  return (
    <Panes
      aside={<CommunitiesPane communityAddresses={communityAddresses} showListSwitch={true} hookCall={hookCall} />}
      asideTitle={`communities (${communityAddresses.length})`}
      inspector={
        <Inspector
          fallback={
            <FeedDetails feedResult={feedResult} communityCount={communities.length} sortType={sortType} newerThan={timeFilterSeconds} stateString={stateString} />
          }
        />
      }
    >
      <FeedHeader feedResult={feedResult} sortType={sortType} timeFilterName={timeFilterName} stateString={stateString} failed={failed} />
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

export default Home;
