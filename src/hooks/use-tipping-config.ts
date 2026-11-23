import { useCommunity } from '@bitsocial/bitsocial-react-hooks';
import { useMemo } from 'react';
import { getTippingConfig } from '../lib/tipping';
import type { TippingConfig } from '../lib/tipping';
import { useCommunityIdentifier } from './use-community-identifier';

// the tipping/v1 options a community publishes, or undefined when it has no tipping
const useTippingConfig = (communityAddress: string | undefined): TippingConfig | undefined => {
  const communityIdentifier = useCommunityIdentifier(communityAddress);
  const challenges: unknown = useCommunity(communityIdentifier ? { community: communityIdentifier } : undefined)?.challenges;
  return useMemo(() => getTippingConfig({ challenges }), [challenges]);
};

export default useTippingConfig;
