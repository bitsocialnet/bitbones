import type { Comment, UseFeedResult } from '@bitsocial/bitsocial-react-hooks';

// UseFeedResult omits updatedFeed, which useFeed does return at runtime, always as an array
// (bitsocial-react-hooks/dist/hooks/feeds/feeds.js). Cast the useFeed result to this at each call
// site that reads updatedFeed.
export type FeedResult = UseFeedResult & { updatedFeed: Comment[] };
