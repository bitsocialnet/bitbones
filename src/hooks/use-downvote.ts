import { usePublishVote, useAccountVote } from '@bitsocial/bitsocial-react-hooks';
import type { Challenge, Comment, Community, PublishVoteOptions } from '@bitsocial/bitsocial-react-hooks';
import { useMemo } from 'react';
import { alertChallengeVerificationFailed } from '../lib/utils';
import useChallenges from './use-challenges';

const useDownvote = (comment?: Comment | Community): [boolean, () => Promise<void>] => {
  const { addChallenge } = useChallenges();
  const { vote } = useAccountVote({ commentCid: comment?.cid });

  // typed as the library's loose PublishVoteOptions bag: UsePublishVoteOptions declares
  // onChallenge/onChallengeVerification as returning Promise<void>, but the library calls them
  // synchronously and discards the result, so these sync handlers do not fit the stricter type.
  const publishVoteOptions: PublishVoteOptions = useMemo(
    () => ({
      commentCid: comment?.cid,
      vote: vote !== -1 ? -1 : 0,
      communityAddress: comment?.communityAddress,
      onChallenge: (...args: [Challenge, Comment?]) => addChallenge([...args, comment]),
      onChallengeVerification: alertChallengeVerificationFailed,
      onError: console.warn,
    }),
    [comment, vote, addChallenge],
  );
  const { publishVote } = usePublishVote(publishVoteOptions);

  return [vote === -1, publishVote];
};

export default useDownvote;
