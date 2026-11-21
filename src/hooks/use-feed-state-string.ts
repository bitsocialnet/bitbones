import { useMemo } from 'react';
import useStateString from './use-state-string';
import { useCommunity, useCommunitiesStates } from '@bitsocial/bitsocial-react-hooks';
import { useCommunityIdentifier, useCommunityIdentifiers } from './use-community-identifier';
import { formatLoadError, getCommunityLoadError, getFeedLoadError } from '../lib/load-errors';

const clientHosts: Record<string, string> = {};
const getClientHost = (clientUrl: string): string => {
  if (!clientHosts[clientUrl]) {
    try {
      clientHosts[clientUrl] = new URL(clientUrl).hostname || clientUrl;
    } catch (e) {
      clientHosts[clientUrl] = clientUrl;
    }
  }
  return clientHosts[clientUrl];
};

interface FeedStateString {
  // what the feed waits on, e.g. 'ipfs.io: 2 fetching-ipns...', or why it failed to load
  stateString: string;
  // the line is an error, not a loading state
  failed: boolean;
}

// feedState is useFeed().state
const useFeedStateString = (communityAddresses: (string | undefined)[] | undefined, feedState: string | undefined): FeedStateString => {
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
    const pagesStatesClientHosts = new Set<string>();
    const pagesStatesCommunityAddresses = new Set<string>();
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

  // a one-community feed shows why its community failed, or the error behind its retries. It reads
  // useCommunity because useFeed is only 'failed' while the feed is empty, and the account's own
  // pending posts can fill it. The useFeed state covers feeds of several communities.
  const loadError = (communityAddress ? getCommunityLoadError(community) : undefined) || getFeedLoadError(feedState);
  if (loadError?.failed) {
    return { stateString: formatLoadError(loadError), failed: true };
  }
  const loadingStateString = singleCommunityFeedStateString || multipleCommunitiesFeedStateString || 'loading...';
  if (loadError) {
    return { stateString: `${loadingStateString} ${formatLoadError(loadError)}`, failed: false };
  }
  return { stateString: loadingStateString, failed: false };
};

export default useFeedStateString;
