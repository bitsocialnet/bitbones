import { useRef, useEffect } from 'react';
import useDefaultCommunityAddresses from '../../hooks/use-default-community-addresses';
import useDefaultList from '../../hooks/use-default-list';
import { useFeed } from '@bitsocial/bitsocial-react-hooks';
import { Virtuoso } from 'react-virtuoso';
import BoardPost from '../../components/board-post';
import { useParams } from 'react-router-dom';
import { useCommunityIdentifiers } from '../../hooks/use-community-identifier';

const lastVirtuosoStates = {};

const Loading = () => 'loading...';

// show own pending posts at the top for 12 hours
const accountComments = { newerThan: 60 * 60 * 12 };

function Board() {
  const params = useParams();
  const communityAddresses = useDefaultCommunityAddresses();
  const [listSource] = useDefaultList();
  const sortType = params?.sortType || 'active';
  const communities = useCommunityIdentifiers(communityAddresses);
  const { feed, hasMore, loadMore } = useFeed({ communities, sortType, accountComments });

  const Footer = hasMore ? Loading : undefined;

  // save last virtuoso state on each scroll
  const virtuosoRef = useRef();
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
      <Virtuoso
        increaseViewportBy={{ bottom: 1200, top: 600 }}
        totalCount={feed?.length || 0}
        data={feed}
        itemContent={(index, post) => <BoardPost index={index} post={post} />}
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

export default Board;
