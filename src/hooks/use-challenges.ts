import createStore from 'zustand';
import type { Challenge, Comment } from '@bitsocial/bitsocial-react-hooks';

// [challenge, publication, publicationTarget]: the two arguments the library's onChallenge callback
// receives, plus the comment the publication targets when the caller has one. Callers append that
// third element themselves, so the length varies and this stays an array rather than a tuple.
export type PendingChallenge = (Challenge | Comment | undefined)[];

interface ChallengesState {
  challenges: PendingChallenge[];
  addChallenge: (challenge: PendingChallenge) => void;
  removeChallenge: () => void;
}

const useChallengesStore = createStore<ChallengesState>((setState, getState) => ({
  challenges: [],
  addChallenge: (challenge) => {
    setState((state) => ({ challenges: [...state.challenges, challenge] }));
  },
  removeChallenge: () =>
    setState((state) => {
      const challenges = [...state.challenges];
      challenges.shift();
      return { challenges };
    }),
}));

export default useChallengesStore;
