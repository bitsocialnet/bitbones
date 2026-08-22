import useDefaultCommunities from './use-default-communities.js';
import { useMemo } from 'react';

const useDefaultCommunityAddresses = () => {
  const defaultCommunities = useDefaultCommunities();
  return useMemo(() => defaultCommunities.map((community) => community.address), [defaultCommunities]);
};

export default useDefaultCommunityAddresses;
