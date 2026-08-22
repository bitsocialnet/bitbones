import { useMemo } from 'react';

// bitsocial-react-hooks takes a CommunityIdentifier ({name} or {publicKey}) everywhere it used to
// take a plain address string. Names always contain a dot ('askseedit.bso', 'music.eth'), public
// keys never do, so the address itself tells us which field to use.
const isLikelyCommunityName = (value) => value.includes('.');

const getCommunityIdentifier = (communityAddress) => {
  if (!communityAddress) {
    return undefined;
  }
  return isLikelyCommunityName(communityAddress) ? { name: communityAddress } : { publicKey: communityAddress };
};

const getCommunityIdentifiers = (communityAddresses) =>
  communityAddresses.flatMap((communityAddress) => {
    const community = getCommunityIdentifier(communityAddress);
    return community ? [community] : [];
  });

export const useCommunityIdentifier = (communityAddress) => useMemo(() => getCommunityIdentifier(communityAddress), [communityAddress]);

export const useCommunityIdentifiers = (communityAddresses) => useMemo(() => getCommunityIdentifiers(communityAddresses ?? []), [communityAddresses]);
