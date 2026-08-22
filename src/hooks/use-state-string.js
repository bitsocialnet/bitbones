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
  // callers pass falsy non-null values (post.jsx hands us `state === 'pending' && accountReply`,
  // i.e. the boolean false). useClientsStates asserts its argument is null/undefined or an object,
  // so normalize before branching or it throws mid-render.
  const target = commentOrCommunity && typeof commentOrCommunity === 'object' ? commentOrCommunity : undefined;
  // useClientsStates also asserts comment and community are never both set. only a community has an
  // `address` without a `communityAddress`, so that is the discriminator.
  const isCommunity = !!target?.address && !target?.communityAddress;
  const { states } = useClientsStates(isCommunity ? { community: target } : { comment: target });
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
    const lifecycleState = isCommunity ? target?.syncState : target?.state;
    if (!stateString && target && lifecycleState !== 'succeeded') {
      if (target.publishingState && target.publishingState !== 'stopped' && target.publishingState !== 'succeeded') {
        stateString = target.publishingState;
      } else if (target.updatingState && target.updatingState !== 'stopped' && target.updatingState !== 'succeeded') {
        stateString = target.updatingState;
      }
    }

    if (stateString) {
      stateString += '...';
    }

    // if string is empty, return undefined instead
    return stateString === '' ? undefined : stateString;
  }, [states, target, isCommunity]);
};

export default useStateString;
