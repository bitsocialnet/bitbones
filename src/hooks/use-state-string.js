import { useMemo } from 'react';
import { useClientsStates } from '@bitsocial/bitsocial-react-hooks';

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

const useStateString = (commentOrCommunity) => {
  // useClientsStates asserts comment and community are never both set. only a community has an
  // `address` without a `communityAddress`, so that is the discriminator.
  const isCommunity = !!commentOrCommunity?.address && !commentOrCommunity?.communityAddress;
  const { states } = useClientsStates(isCommunity ? { community: commentOrCommunity } : { comment: commentOrCommunity });
  return useMemo(() => {
    let stateString = '';
    for (const state in states) {
      const clientUrls = states[state];
      const clientHosts = clientUrls.map((clientUrl) => getClientHost(clientUrl));

      // if there are no valid hosts, skip this state
      if (clientHosts.length === 0) {
        continue;
      }

      // separate 2 different states using ' '
      if (stateString) {
        stateString += ' ';
      }

      // e.g. 'cloudflare-ipfs.com/ipfs.io: fetching-ipfs'
      stateString += `${clientHosts.join('/')}: ${state}`;
    }

    // fallback to comment or community state when possible. a community's `state` stays 'succeeded'
    // while cached data exists, so its refresh lifecycle lives on `syncState` instead.
    const lifecycleState = isCommunity ? commentOrCommunity?.syncState : commentOrCommunity?.state;
    if (!stateString && lifecycleState !== 'succeeded') {
      if (commentOrCommunity?.publishingState && commentOrCommunity?.publishingState !== 'stopped' && commentOrCommunity?.publishingState !== 'succeeded') {
        stateString = commentOrCommunity.publishingState;
      } else if (commentOrCommunity?.updatingState !== 'stopped' && commentOrCommunity?.updatingState !== 'succeeded') {
        stateString = commentOrCommunity.updatingState;
      }
    }

    if (stateString) {
      stateString += '...';
    }

    // if string is empty, return undefined instead
    return stateString === '' ? undefined : stateString;
  }, [states, commentOrCommunity, isCommunity]);
};

export default useStateString;
