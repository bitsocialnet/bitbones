import { useCommunity } from '@bitsocial/bitsocial-react-hooks';
import { useMemo } from 'react';
import { getTippingConfig } from '../lib/tipping';
import type { TippingConfig } from '../lib/tipping';
import { useCommunityIdentifier } from './use-community-identifier';

// the tipping/v1 options a community publishes, or undefined when it has no tipping
const useTippingConfig = (communityAddress: string | undefined): TippingConfig | undefined => {
  const communityIdentifier = useCommunityIdentifier(communityAddress);
  const community = useCommunity(communityIdentifier ? { community: communityIdentifier } : undefined);
  const challenges: unknown = community?.challenges;
  // the community rides along: a comment's update is validated against its signature
  return useMemo(() => {
    const config = getTippingConfig({ challenges });
    return config && { ...config, community };
  }, [challenges, community]);
};

export default useTippingConfig;
