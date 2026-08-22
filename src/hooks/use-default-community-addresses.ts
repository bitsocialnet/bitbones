import useDefaultCommunities from './use-default-communities';
import { useMemo } from 'react';

const useDefaultCommunityAddresses = (): string[] => {
  const defaultCommunities = useDefaultCommunities();
  return useMemo(() => defaultCommunities.map((community) => community.address), [defaultCommunities]);
};

export default useDefaultCommunityAddresses;
