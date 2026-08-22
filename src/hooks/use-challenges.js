import { create } from 'zustand';

const useChallengesStore = create((setState, getState) => ({
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
