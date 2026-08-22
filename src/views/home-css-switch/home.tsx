import { useRef, useEffect } from 'react';
import useDefaultCommunityAddresses from '../../hooks/use-default-community-addresses';
import { useFeed } from '@bitsocial/bitsocial-react-hooks';
import { Virtuoso } from 'react-virtuoso';
import FeedPost from './feed-post';
import { useParams, useMatch } from 'react-router-dom';
import useFeedStateString from '../../hooks/use-feed-state-string';
import useTimeFilter from '../../hooks/use-time-filter';
import PostView from '../../views/post';
import styles from './home.module.css';
import { useCommunityIdentifiers } from '../../hooks/use-community-identifier';

const lastVirtuosoStates = {};

const NoPosts = () => 'no posts';

// show own pending posts at the top for 12 hours
const accountComments = { newerThan: 60 * 60 * 12 };

function Home() {
  const params = useParams();
  const communityAddresses = useDefaultCommunityAddresses();
  const sortType = params?.sortType || 'hot';
  // const {timeFilterSeconds} = useTimeFilter()
  const timeFilterSeconds = undefined;
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
  // const virtuosoRef = useRef()
  // useEffect(() => {
  //   const setLastVirtuosoState = () =>
  //     virtuosoRef.current?.getState((snapshot) => {
  //       // TODO: not sure if checking for empty snapshot.ranges works for all scenarios
  //       if (snapshot?.ranges?.length) {
  //         lastVirtuosoStates[sortType + timeFilterSeconds] = snapshot
  //       }
  //     })
  //   window.addEventListener('scroll', setLastVirtuosoState)
  //   // clean listener on unmount
  //   return () => window.removeEventListener('scroll', setLastVirtuosoState)
  // }, [sortType, timeFilterSeconds])
  // const lastVirtuosoState = lastVirtuosoStates?.[sortType + timeFilterSeconds]

  return (
    <div class={styles.wrapper}>
      <div className={[!params.commentCid ? styles.visible : styles.hidden].join(' ')}>
        <Virtuoso
          increaseViewportBy={{ bottom: 1200, top: 600 }}
          totalCount={feed?.length || 0}
          data={feed}
          itemContent={(index, post) => <FeedPost index={index} post={post} updatedPost={updatedFeed[index]} />}
          useWindowScroll={true}
          components={{ Footer }}
          endReached={loadMore}
          // ref={virtuosoRef}
          // restoreStateFrom={lastVirtuosoState}
          // initialScrollTop={lastVirtuosoState?.scrollTop}
        />
      </div>

      <div className={[styles.postViewWrapper, params.commentCid ? styles.visible : styles.hidden].join(' ')}>
        <PostView />
      </div>
    </div>
  );
}

export default Home;
