import { useMemo } from 'react';
import type { CommunityIdentifier } from '@bitsocial/bitsocial-react-hooks';

// bitsocial-react-hooks takes a CommunityIdentifier ({name} or {publicKey}) everywhere it used to
// take a plain address string. Names always contain a dot ('askseedit.bso', 'music.eth'), public
// keys never do, so the address itself tells us which field to use.
const isLikelyCommunityName = (value: string): boolean => value.includes('.');

const getCommunityIdentifier = (communityAddress: string | undefined): CommunityIdentifier | undefined => {
  if (!communityAddress) {
    return undefined;
  }
  return isLikelyCommunityName(communityAddress) ? { name: communityAddress } : { publicKey: communityAddress };
};

// the element type allows undefined because single community views build their array out of an
// optional route param, and the missing entries are dropped here rather than by the caller
const getCommunityIdentifiers = (communityAddresses: (string | undefined)[]): CommunityIdentifier[] =>
  communityAddresses.flatMap((communityAddress) => {
    const community = getCommunityIdentifier(communityAddress);
    return community ? [community] : [];
  });

export const useCommunityIdentifier = (communityAddress: string | undefined): CommunityIdentifier | undefined =>
  useMemo(() => getCommunityIdentifier(communityAddress), [communityAddress]);

export const useCommunityIdentifiers = (communityAddresses: (string | undefined)[] | undefined): CommunityIdentifier[] =>
  useMemo(() => getCommunityIdentifiers(communityAddresses ?? []), [communityAddresses]);
