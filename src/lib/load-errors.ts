import type { Comment, UseCommunityResult } from '@bitsocial/bitsocial-react-hooks';

// Since bitsocial-react-hooks 0.3.1 a hook reports `state: 'failed'` once a load failed, instead of
// staying on 'initializing' or a loading state. These read that signal, so a view shows the error in
// place of a loading label rather than guessing a failure from updatingState.

export interface LoadError {
  // true when the load failed for good (printed in --error); false while it is retried (--warn)
  failed: boolean;
  message?: string;
}

// useCommunity is 'failed' while the community has no record and its load failed non-retriably. An
// unreachable community, which pkc-js retries forever, keeps a loading state and only sets
// firstLoadFailed, with the error behind the retries in lastRetriableError. Both clear once a record loads.
export const getCommunityLoadError = (community?: UseCommunityResult): LoadError | undefined => {
  if (community?.state === 'failed') {
    return { failed: true, message: community.error?.message };
  }
  if (community?.firstLoadFailed) {
    return { failed: false, message: community.lastRetriableError?.message };
  }
};

// useFeed is 'failed' while the feed has no posts and every community of it that isn't blocked failed
// to load non-retriably, the case where each one's useCommunity is 'failed'
export const getFeedLoadError = (feedState?: string): LoadError | undefined => {
  if (feedState === 'failed') {
    return { failed: true, message: 'every community of the feed failed to load' };
  }
};

// useComment is 'failed' when the comment's last load failed and nothing loaded since. The account's
// own comment carries its account index, and 'failed' on it means its publication failed, which the
// views label as a failed publish, so it is not a load error.
export const getCommentLoadError = (comment?: Comment): LoadError | undefined => {
  if (comment?.state === 'failed' && typeof comment.index !== 'number') {
    return { failed: true, message: comment.error?.message };
  }
};

// 'failed: <reason>', or 'first load failed: <reason>' next to the state of the retry
export const formatLoadError = ({ failed, message }: LoadError): string => `${failed ? 'failed' : 'first load failed'}${message ? `: ${message}` : ''}`;
