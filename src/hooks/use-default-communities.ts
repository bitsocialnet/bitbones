import { useEffect, useState } from 'react';
import useDefaultList from './use-default-list';
import { getCachedDefaultList, getDefaultList } from '../lib/default-lists';

// The default communities of whichever client is currently selected (5chan or seedit).
// Returns [{address, title}] so the submit menu can still show titles.
export const useDefaultCommunitiesState = () => {
  const [listSource] = useDefaultList();
  const [communities, setCommunities] = useState(() => getCachedDefaultList(listSource));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState();

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

const useDefaultCommunities = () => useDefaultCommunitiesState().communities;

export default useDefaultCommunities;
