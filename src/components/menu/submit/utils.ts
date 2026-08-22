import { useAccount } from '@bitsocial/bitsocial-react-hooks';
import useDefaultCommunities from '../../../hooks/use-default-communities';
import getShortAddress from '../../../lib/get-short-address';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

export const isLink = (content?: string): boolean => {
  if (!content) {
    return false;
  }
  content = content.trim();
  if (
    // starts with https://
    /^https:\/\//i.test(content) &&
    // doesn't contain spaces or line breaks
    !/[ \n]/.test(content)
  ) {
    return true;
  }
  return false;
};

// one option of the submit menu's community select
export interface SubmitCommunity {
  address: string;
  displayAddress: string;
}

export const useDefaultAndSubscriptionsCommunities = (): SubmitCommunity[] => {
  const { communityAddress: communityAddressParam } = useParams<{ communityAddress?: string }>();
  const account = useAccount();
  const defaultCommunities = useDefaultCommunities();
  return useMemo(() => {
    const communities: Record<string, SubmitCommunity> = {};
    // add community from params first so easily visible
    if (communityAddressParam) {
      communities[communityAddressParam] = { address: communityAddressParam, displayAddress: communityAddressParam };
    }
    for (const address of account.subscriptions) {
      communities[address] = { address, displayAddress: getShortAddress(address) };
    }
    for (const community of defaultCommunities) {
      if (!community.address) {
        continue;
      }
      communities[community.address] = { address: community.address, displayAddress: community.address };
      if (!community.address.includes('.')) {
        communities[community.address].displayAddress = getShortAddress(community.address);
        if (community.title) {
          communities[community.address].displayAddress += ` ${community.title}`;
        }
        if (communities[community.address].displayAddress.length > 40) {
          communities[community.address].displayAddress = communities[community.address].displayAddress.substring(0, 40) + '...';
        }
      }
    }
    return Object.values(communities);
  }, [account.subscriptions, defaultCommunities, communityAddressParam]);
};
