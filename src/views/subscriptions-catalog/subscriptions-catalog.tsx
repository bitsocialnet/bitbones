import { useMemo, useRef, useEffect } from 'react';
import { useFeed, useAccount } from '@bitsocial/bitsocial-react-hooks';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { Virtuoso, type StateSnapshot, type VirtuosoHandle } from 'react-virtuoso';
import useWindowWidth from '../../hooks/use-window-width';
import { useParams } from 'react-router-dom';
import utils from '../../lib/utils';
import CatalogRow from '../../components/catalog-row';
import useFeedStateString from '../../hooks/use-feed-state-string';
import useTimeFilter from '../../hooks/use-time-filter';
import { useCommunityIdentifiers } from '../../hooks/use-community-identifier';

const useFeedRows = (feed: Comment[], columnCount: number): Comment[][] => {
  const rowsRef = useRef<Comment[][] | undefined>(undefined);
  return useMemo(() => {
    const rows: Comment[][] = [];
    for (let i = 0; i < feed.length; i += columnCount) {
      // if previous rows have the row, use the previous row so it uses the same array and avoids rerenders
      if (rowsRef.current?.[rows.length] && rowsRef.current[rows.length].length === columnCount) {
        rows.push(rowsRef.current[rows.length]);
      } else {
        rows.push(feed.slice(i, i + columnCount));
      }
    }
    // save ref to get access to the previous rows next render
    rowsRef.current = rows;
    return rows;
  }, [feed, columnCount]);
};

const lastVirtuosoStates: Record<string, StateSnapshot> = {};

// column width in px
const columnWidth = 180;

const NoSubscriptions = () => 'no subscriptions';
const NoPosts = () => 'no image posts';

// show own pending posts at the top for 12 hours
const accountComments = { newerThan: 60 * 60 * 12 };

function Catalog() {
  const windowWidth = useWindowWidth();
  const columnCount = Math.floor(windowWidth / columnWidth);
  const params = useParams<{ sortType?: string }>();
  const account = useAccount();
  const communityAddresses = account?.subscriptions;
  const sortType = params?.sortType || 'active';
  const { timeFilterSeconds } = useTimeFilter();
  // postPerPage based on columnCount for optimized feed, dont change value after first render
  // eslint-disable-next-line
  const postsPerPage = useMemo(() => (columnCount <= 2 ? 10 : columnCount === 3 ? 15 : columnCount === 4 ? 20 : 25), []);
  const communities = useCommunityIdentifiers(communityAddresses);
  const { feed, hasMore, loadMore } = useFeed({
    communities,
    sortType,
    postsPerPage,
    filter: utils.catalogCommentsFilter,
    newerThan: timeFilterSeconds,
    accountComments,
  });
  const loadingStateString = useFeedStateString(communityAddresses) || 'loading...';

  // split feed into rows
  const rows = useFeedRows(feed, columnCount);

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
    // TODO: doesn't work if the user hasn't scrolled
    window.addEventListener('scroll', setLastVirtuosoState);
    // clean listener on unmount
    return () => window.removeEventListener('scroll', setLastVirtuosoState);
  }, [sortType]);
  const lastVirtuosoState = lastVirtuosoStates?.[sortType];

  return (
    <div>
      <Virtuoso
        increaseViewportBy={{ bottom: 1200, top: 600 }}
        totalCount={rows?.length || 0}
        data={rows}
        itemContent={(index, row) => <CatalogRow index={index} row={row} />}
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

export default Catalog;
