import { usePublishVote, useAccountVote } from '@bitsocial/bitsocial-react-hooks';
import type { Challenge, Comment, Community, PublishVoteOptions } from '@bitsocial/bitsocial-react-hooks';
import { useEffect, useMemo, useRef } from 'react';
import { alertChallengeVerificationFailed } from '../lib/utils';
import useChallenges from './use-challenges';

// whether the account's vote on the comment is `voteValue`, and a function that casts it, or
// withdraws it when it is already cast
const useVote = (comment: Comment | Community | undefined, voteValue: 1 | -1): [boolean, () => Promise<void>] => {
  const { addChallenge } = useChallenges();
  const { vote } = useAccountVote({ commentCid: comment?.cid });
  // publishVote stores the account vote as soon as publishing starts, so a cancelled challenge has
  // to give the vote up through abandonPublish, which restores the vote it replaced. Stopping the
  // publication alone leaves the arrow selected. A ref, because the options that queue the
  // challenge are built before usePublishVote returns abandonPublish.
  const abandonPublishRef = useRef<(() => Promise<void>) | undefined>(undefined);

  // typed as the library's loose PublishVoteOptions bag: UsePublishVoteOptions declares
  // onChallenge/onChallengeVerification as returning Promise<void>, but the library calls them
  // synchronously and discards the result, so these sync handlers do not fit the stricter type.
  const publishVoteOptions: PublishVoteOptions = useMemo(
    () => ({
      commentCid: comment?.cid,
      vote: vote !== voteValue ? voteValue : 0,
      communityAddress: comment?.communityAddress,
      onChallenge: (...args: [Challenge, Comment?]) => addChallenge([...args, comment], async () => abandonPublishRef.current?.()),
      onChallengeVerification: alertChallengeVerificationFailed,
      onError: console.warn,
    }),
    [comment, vote, voteValue, addChallenge],
  );
  const { publishVote, abandonPublish } = usePublishVote(publishVoteOptions);
  useEffect(() => {
    abandonPublishRef.current = abandonPublish;
  }, [abandonPublish]);

  return [vote === voteValue, publishVote];
};

export default useVote;
