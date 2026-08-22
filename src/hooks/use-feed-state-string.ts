import { useMemo } from 'react';
import useStateString from './use-state-string';
import { useCommunity, useCommunitiesStates } from '@bitsocial/bitsocial-react-hooks';
import { useCommunityIdentifier, useCommunityIdentifiers } from './use-community-identifier';

const clientHosts = {};
const getClientHost = (clientUrl) => {
  if (!clientHosts[clientUrl]) {
    try {
      clientHosts[clientUrl] = new URL(clientUrl).hostname || clientUrl;
    } catch (e) {
      clientHosts[clientUrl] = clientUrl;
    }
  }
  return clientHosts[clientUrl];
};

const useFeedStateString = (communityAddresses) => {
  // single community feed state string
  const communityAddress = communityAddresses?.length === 1 ? communityAddresses[0] : undefined;
  const communityIdentifier = useCommunityIdentifier(communityAddress);
  const community = useCommunity(communityIdentifier ? { community: communityIdentifier } : undefined);
  const singleCommunityFeedStateString = useStateString(community);

  // multiple community feed state string
  const communities = useCommunityIdentifiers(communityAddresses);
  const { states } = useCommunitiesStates({ communities });

  const multipleCommunitiesFeedStateString = useMemo(() => {
    if (communityAddress) {
      return;
    }

    // e.g. infura.io: 2 resolving-address, cloudflare-ipfs.com/ipfs.io: 2 fetching-ipns 1 fetching-ipfs
    let stateString = '';

    if (states['resolving-address']) {
      const { communityAddresses, clientUrls } = states['resolving-address'];
      if (communityAddresses.length && clientUrls.length) {
        stateString += `${clientUrls.map(getClientHost).join('/')}: ${communityAddresses.length} resolving-address`;
      }
    }

    // find all page client and sub addresses
    const pagesStatesClientHosts = new Set();
    const pagesStatesCommunityAddresses = new Set();
    for (const state in states) {
      if (state.match('page')) {
        states[state].clientUrls.forEach((clientUrl) => pagesStatesClientHosts.add(getClientHost(clientUrl)));
        states[state].communityAddresses.forEach((communityAddress) => pagesStatesCommunityAddresses.add(communityAddress));
      }
    }

    if (states['fetching-ipns'] || states['fetching-ipfs'] || pagesStatesCommunityAddresses.size) {
      // separate 2 different states using ' '
      if (stateString) {
        stateString += ' ';
      }

      // find all client urls
      const clientHosts = new Set([...pagesStatesClientHosts]);
      states['fetching-ipns']?.clientUrls.forEach((clientUrl) => clientHosts.add(getClientHost(clientUrl)));
      states['fetching-ipfs']?.clientUrls.forEach((clientUrl) => clientHosts.add(getClientHost(clientUrl)));

      if (clientHosts.size) {
        stateString += `${[...clientHosts].join('/')}: `;
        if (states['fetching-ipns']) {
          stateString += `${states['fetching-ipns'].communityAddresses.length} fetching-ipns`;
        }
        if (states['fetching-ipfs']) {
          if (states['fetching-ipns']) {
            stateString += ' ';
          }
          stateString += `${states['fetching-ipfs'].communityAddresses.length} fetching-ipfs`;
        }
        if (pagesStatesCommunityAddresses.size) {
          if (states['fetching-ipns'] || states['fetching-ipfs']) {
            stateString += ' ';
          }
          stateString += `${pagesStatesCommunityAddresses.size} fetching-page`;
        }
      }
    }

    if (stateString) {
      stateString += '...';
    }

    // if string is empty, return undefined instead
    return stateString === '' ? undefined : stateString;
  }, [states, communityAddress]);

  if (singleCommunityFeedStateString) {
    return singleCommunityFeedStateString;
  }
  return multipleCommunitiesFeedStateString;
};

export default useFeedStateString;
