import type { ReactNode } from 'react';
import type { UseFeedResult } from '@bitsocial/bitsocial-react-hooks';
import styles from './feed-header.module.css';

interface FeedHeaderProps {
  feedResult: UseFeedResult;
  sortType: string;
  timeFilterName?: string;
  stateString?: string;
}

// one line above a feed: what useFeed returned so far and what it is waiting on
const FeedHeader = ({ feedResult, sortType, timeFilterName, stateString }: FeedHeaderProps) => {
  const { feed, bufferedFeed, hasMore } = feedResult;
  return (
    <div className={styles.feedHeader}>
      <span>
        feed · {sortType}
        {timeFilterName ? ` · ${timeFilterName}` : ''} · {feed?.length || 0} shown · {bufferedFeed?.length || 0} buffered
      </span>
      {hasMore && <span className={styles.loading}>{stateString || 'loading...'}</span>}
    </div>
  );
};

// virtuoso footer: loading state, end of feed, empty feed
interface FeedFooterProps {
  children: ReactNode;
}

export const FeedFooter = ({ children }: FeedFooterProps) => <div className={styles.feedFooter}>{children}</div>;

export default FeedHeader;
