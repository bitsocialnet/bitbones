import { useRef, useEffect } from 'react';
import useDefaultCommunityAddresses from '../../hooks/use-default-community-addresses';
import useDefaultList from '../../hooks/use-default-list';
import { useFeed } from '@bitsocial/bitsocial-react-hooks';
import type { Comment, UseFeedResult } from '@bitsocial/bitsocial-react-hooks';
import { Virtuoso } from 'react-virtuoso';
import type { Components, StateSnapshot, VirtuosoHandle } from 'react-virtuoso';
import FeedPost from './feed-post';
import { useParams, useLocation } from 'react-router-dom';
import PostModal from './post-modal';
import useFeedStateString from '../../hooks/use-feed-state-string';
import { useCommunityIdentifiers } from '../../hooks/use-community-identifier';

// UseFeedResult omits updatedFeed, which useFeed does return at runtime, always as an array
// (bitsocial-react-hooks/dist/hooks/feeds/feeds.js)
type FeedResult = UseFeedResult & { updatedFeed: Comment[] };

const lastVirtuosoStates: Record<string, StateSnapshot> = {};

const NoPosts = () => 'no posts';

// show own pending posts at the top for 12 hours
const accountComments = { newerThan: 60 * 60 * 12 };

function Home() {
  const params = useParams();
  // dont load the feed if the user loads the post page directly
  const isFirstLocationAndIsPost = useLocation().key === 'default' && params.commentCid;
  const communityAddresses = useDefaultCommunityAddresses();
  const [listSource] = useDefaultList();
  const sortType = params?.sortType || 'hot';
  const communities = useCommunityIdentifiers(communityAddresses);
  const { feed, updatedFeed, hasMore, loadMore } = useFeed({ communities, sortType, accountComments }) as FeedResult;
  const loadingStateString = useFeedStateString(communityAddresses) || 'loading...';

  let Footer: Components['Footer'];
  if (feed?.length === 0) {
    Footer = NoPosts;
  }
  if (hasMore || communityAddresses.length === 0) {
    Footer = () => loadingStateString;
  }

  // save last virtuoso state on each scroll
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  useEffect(() => {
    const setLastVirtuosoState = () =>
      virtuosoRef.current?.getState((snapshot) => {
        // TODO: not sure if checking for empty snapshot.ranges works for all scenarios
        if (snapshot?.ranges?.length) {
          lastVirtuosoStates[listSource + sortType] = snapshot;
        }
      });
    window.addEventListener('scroll', setLastVirtuosoState);
    // clean listener on unmount
    return () => window.removeEventListener('scroll', setLastVirtuosoState);
  }, [sortType, listSource]);
  const lastVirtuosoState = lastVirtuosoStates?.[listSource + sortType];

  return (
    <div>
      <PostModal />
      {!isFirstLocationAndIsPost && (
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
      )}
    </div>
  );
}

export default Home;
