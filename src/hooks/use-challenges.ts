import { create } from 'zustand';
import type { Challenge, Comment } from '@bitsocial/bitsocial-react-hooks';

// [challenge, publication, publicationTarget]: the two arguments the library's onChallenge callback
// receives, plus the comment the publication targets when the caller has one. Callers append that
// third element themselves, so the length varies and this stays an array rather than a tuple.
export type PendingChallenge = (Challenge | Comment | undefined)[];

interface QueuedChallenge {
  // the challenge modal keys each queued challenge by this, so its step and answers start over
  id: number;
  challenge: PendingChallenge;
  onAbandon?: () => Promise<void>;
}

// the library hands onChallenge an open record; stop() ends a publication still waiting for answers
export type StoppablePublication = { stop?: () => Promise<void> };

let nextChallengeId = 0;

interface ChallengesState {
  challenges: QueuedChallenge[];
  addChallenge: (challenge: PendingChallenge, onAbandon?: () => Promise<void>) => void;
  removeChallenge: () => void;
  abandonChallenge: () => void;
}

const useChallengesStore = create<ChallengesState>((setState, getState) => ({
  challenges: [],
  addChallenge: (challenge, onAbandon) => {
    setState((state) => ({ challenges: [...state.challenges, { id: nextChallengeId++, challenge, onAbandon }] }));
  },
  removeChallenge: () =>
    setState((state) => {
      const challenges = [...state.challenges];
      challenges.shift();
      return { challenges };
    }),
  // a cancelled or dismissed challenge will never be answered, so give up its publication too:
  // the caller's onAbandon when it has one, otherwise stop the publication
  abandonChallenge: () => {
    const abandonedChallenge = getState().challenges[0];
    getState().removeChallenge();
    if (!abandonedChallenge) {
      return;
    }
    const publication = abandonedChallenge.challenge[1] as StoppablePublication | undefined;
    const abandon = abandonedChallenge.onAbandon || (() => publication?.stop?.());
    Promise.resolve()
      .then(abandon)
      .catch((error: unknown) => console.warn('failed to abandon the challenged publication', error));
  },
}));

export default useChallengesStore;
