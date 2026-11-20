import type { ReactNode } from 'react';
import type { UseFeedResult } from '@bitsocial/bitsocial-react-hooks';
import styles from './feed-header.module.css';

interface FeedHeaderProps {
  feedResult: UseFeedResult;
  sortType: string;
  timeFilterName?: string;
  stateString?: string;
  // stateString is why the feed failed to load, not what it is loading
  failed?: boolean;
}

// one line above a feed: what useFeed returned so far and what it is waiting on, or why it failed
const FeedHeader = ({ feedResult, sortType, timeFilterName, stateString, failed }: FeedHeaderProps) => {
  const { feed, bufferedFeed, hasMore } = feedResult;
  return (
    <div className={styles.feedHeader}>
      <span>
        feed · {sortType}
        {timeFilterName ? ` · ${timeFilterName}` : ''} · {feed?.length || 0} shown · {bufferedFeed?.length || 0} buffered
      </span>
      {hasMore && <span className={failed ? styles.failed : styles.loading}>{stateString || 'loading...'}</span>}
    </div>
  );
};

// virtuoso footer: loading state, load error, end of feed, empty feed
interface FeedFooterProps {
  children: ReactNode;
  failed?: boolean;
}

export const FeedFooter = ({ children, failed }: FeedFooterProps) => <div className={[styles.feedFooter, failed ? styles.failed : undefined].join(' ')}>{children}</div>;

export default FeedHeader;
