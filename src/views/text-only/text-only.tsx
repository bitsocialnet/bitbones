import { useRef, useEffect } from 'react';
import useDefaultCommunityAddresses from '../../hooks/use-default-community-addresses';
import useDefaultList from '../../hooks/use-default-list';
import { useFeed } from '@bitsocial/bitsocial-react-hooks';
import { Virtuoso, type StateSnapshot, type VirtuosoHandle } from 'react-virtuoso';
import TextOnlyPost from '../../components/text-only-post';
import { useParams } from 'react-router-dom';
import { useCommunityIdentifiers } from '../../hooks/use-community-identifier';

const lastVirtuosoStates: Record<string, StateSnapshot> = {};

const Loading = () => 'loading...';
const NoPosts = () => 'no posts';

// show own pending posts at the top for 12 hours
const accountComments = { newerThan: 60 * 60 * 12 };

function TextOnly() {
  const params = useParams<{ sortType?: string }>();
  const communityAddresses = useDefaultCommunityAddresses();
  const [listSource] = useDefaultList();
  const sortType = params?.sortType || 'hot';
  const communities = useCommunityIdentifiers(communityAddresses);
  const { feed, hasMore, loadMore } = useFeed({ communities, sortType, accountComments });

  let Footer;
  if (feed?.length === 0) {
    Footer = NoPosts;
  }
  if (hasMore) {
    Footer = Loading;
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
      <Virtuoso
        increaseViewportBy={{ bottom: 1200, top: 600 }}
        totalCount={feed?.length || 0}
        data={feed}
        itemContent={(index, post) => <TextOnlyPost index={index} post={post} />}
        useWindowScroll={true}
        components={{ Footer }}
        endReached={loadMore}
        ref={virtuosoRef}
        restoreStateFrom={lastVirtuosoState}
        initialScrollTop={lastVirtuosoState?.scrollTop}
        defaultItemHeight={42}
        fixedItemHeight={42}
      />
    </div>
  );
}

export default TextOnly;
