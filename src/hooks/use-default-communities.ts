import { useEffect, useState } from 'react';
import useDefaultList from './use-default-list';
import { getCachedDefaultList, getDefaultList } from '../lib/default-lists';
import type { DefaultListCommunity } from '../lib/default-lists';

export interface DefaultCommunitiesState {
  communities: DefaultListCommunity[];
  loading: boolean;
  error: Error | undefined;
  listSource: string;
}

// The default communities of whichever client is currently selected (5chan or seedit).
// Returns [{address, title}] so the submit menu can still show titles.
export const useDefaultCommunitiesState = (): DefaultCommunitiesState => {
  const [listSource] = useDefaultList();
  const [communities, setCommunities] = useState<DefaultListCommunity[]>(() => getCachedDefaultList(listSource));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>();

  useEffect(() => {
    let mounted = true;
    // swap to the other client's cached/vendored list immediately, then refresh in the background
    setCommunities(getCachedDefaultList(listSource));
    setError(undefined);
    setLoading(true);
    getDefaultList(listSource)
      .then((result) => {
        // drop a response that lost a toggle race
        if (!mounted || result.source !== listSource) {
          return;
        }
        setCommunities(result.communities);
      })
      .catch((e) => {
        console.warn(e);
        if (mounted) {
          setError(e);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [listSource]);

  return { communities, loading, error, listSource };
};

const useDefaultCommunities = (): DefaultListCommunity[] => useDefaultCommunitiesState().communities;

export default useDefaultCommunities;
