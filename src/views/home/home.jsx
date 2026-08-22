import { useRef, useEffect } from 'react';
import useDefaultCommunityAddresses from '../../hooks/use-default-community-addresses';
import useDefaultList from '../../hooks/use-default-list';
import { useFeed } from '@bitsocial/bitsocial-react-hooks';
import { Virtuoso } from 'react-virtuoso';
import FeedPost from '../../components/feed-post';
import { useParams } from 'react-router-dom';
import useFeedStateString from '../../hooks/use-feed-state-string';
import useTimeFilter from '../../hooks/use-time-filter';
import { useCommunityIdentifiers } from '../../hooks/use-community-identifier';

const lastVirtuosoStates = {};

const NoPosts = () => 'no posts';

// show own pending posts at the top for 12 hours
const accountComments = { newerThan: 60 * 60 * 12 };

function Home() {
  const params = useParams();
  const communityAddresses = useDefaultCommunityAddresses();
  const [listSource] = useDefaultList();
  const sortType = params?.sortType || 'hot';
  const { timeFilterSeconds } = useTimeFilter();
  const communities = useCommunityIdentifiers(communityAddresses);
  const { feed, updatedFeed, hasMore, loadMore } = useFeed({ communities, sortType, postsPerPage: 10, newerThan: timeFilterSeconds, accountComments });
  const loadingStateString = useFeedStateString(communityAddresses) || 'loading...';

  let Footer;
  if (feed?.length === 0) {
    Footer = NoPosts;
  }
  if (hasMore || communityAddresses.length === 0) {
    Footer = () => loadingStateString;
  }

  // save last virtuoso state on each scroll
  const virtuosoRef = useRef();
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

export default Home;
