import DragAndDrop from './drag-and-drop';
import pkcRpcSettings from './pkc-rpc-settings-mock';
import { useState, type ChangeEvent } from 'react';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Draft } from 'immer';
import type { PkcRpcChallengeOptionInput, PkcRpcChallengeSettings } from '@bitsocial/bitsocial-react-hooks';
import styles from './challenge-builder.module.css';
import ChallengeExclude from './challenge-builder-exclude';

// community.challenges = {
//   combinator: 'or',
//   challenges: [
//     {
//       name: 'whitelist',
//       options: {},
//       rateLimit: {
//         name: 'age-and-score',
//         options: {
//           replyMultiplier: '2', // allow 2x more replies
//           voteMultiplier: '4' // allow 4x more votes
//         }
//       }
//     },
//     {
//       name: 'mintpass',
//       options: {},
//       pendingApproval: {
//         exclude: [
//           {
//             name: 'age-and-score',
//             options: {
//               daysOld: '20',
//               score: '10',
//               replyMultiplier: '0.5' // make replies 2x as easy as posts to avoid pendingApproval
//             }
//           }
//         ]
//       }
//     },
//   ],
//   exclude: [
//     {
//       name: 'role',
//       options: {
//         roles: 'moderator,admin,owner'
//       },
//       rateLimit: {
//         name: 'per-hour',
//         options: {
//           perHour: 50,
//           commentModerationsPerHour: 100
//         }
//       }
//     }
//   ]
// }

// a challenges tree node is either a single challenge leaf ({name, options, exclude}) or a group of
// challenges ({combinator, challenges}); appendChildChallenge upgrades a leaf into a group in place,
// so both shapes share one node type with optional props
export interface ChallengeExcludeNode {
  name?: string;
  options?: Record<string, string>;
}

export interface ChallengeNode {
  combinator?: string;
  challenges?: ChallengeNodeList;
  name?: string;
  options?: Record<string, string>;
  exclude?: ChallengeExcludeNode[];
}

// the challenge group branch reads `combinator` off the children array itself, so the list type carries it
interface ChallengeNodeList extends Array<ChallengeNode> {
  combinator?: string;
}

// the root of the tree is always a group, so its children array is never missing
interface ChallengesTree extends ChallengeNode {
  challenges: ChallengeNodeList;
}

interface ChallengesState {
  challengesTree: ChallengesTree;
  appendChildChallenge: (challengesTreePath: number[], newChallenge?: ChallengeNode) => void;
  appendChallenge: (challengesTreePath: number[], newChallenge?: ChallengeNode) => void;
  updateChallenge: (challengesTreePath: number[], updates: ChallengeNode) => void;
  removeChallenge: (challengesTreePath: number[]) => void;
}

export const useChallengesStore = create<ChallengesState>()(
  immer((setState, getState) => ({
    challengesTree: {
      combinator: 'and',
      challenges: [],
    },
    appendChildChallenge: (challengesTreePath, newChallenge = {}) =>
      setState((state) => {
        let challenge: Draft<ChallengeNode> = state.challengesTree;
        for (const index of challengesTreePath) {
          if (!challenge.challenges) challenge.challenges = [];
          challenge = challenge.challenges[index];
        }
        // if it's a single challenge, upgrade it into a challenge group
        if (!challenge.challenges) {
          const singleChallenge = { ...challenge };
          // reset props of challenge leaf with immer
          Object.keys(challenge).forEach((key) => delete challenge[key as keyof ChallengeNode]);
          challenge.combinator = 'and';
          challenge.challenges = [singleChallenge];
        }
        challenge.challenges.push(newChallenge);
      }),
    appendChallenge: (challengesTreePath, newChallenge = {}) =>
      setState((state) => {
        if (!challengesTreePath || challengesTreePath.length === 0) {
          // append at root level
          state.challengesTree.challenges.push(newChallenge);
          return;
        }
        // walk down to target node
        // the walk already assumes every path segment resolves, so the target is asserted rather than checked
        let challenge: Draft<ChallengeNode> | undefined = state.challengesTree;
        for (const index of challengesTreePath) {
          challenge = challenge!.challenges?.[index];
        }
        if (!challenge!.challenges) challenge!.challenges = [];
        challenge!.challenges.push(newChallenge);
      }),
    updateChallenge: (challengesTreePath, updates) =>
      setState((state) => {
        let challenge: Draft<ChallengeNode> | undefined = state.challengesTree;
        for (const index of challengesTreePath) {
          challenge = challenge!.challenges?.[index];
        }
        Object.assign(challenge!, updates);
      }),
    removeChallenge: (challengesTreePath) =>
      setState((state) => {
        if (challengesTreePath.length === 0) return; // prevent deleting the whole tree
        let challenge: Draft<ChallengeNode> | undefined = state.challengesTree;
        for (let i = 0; i < challengesTreePath.length - 1; i++) {
          challenge = challenge!.challenges?.[challengesTreePath[i]];
        }
        challenge!.challenges?.splice(challengesTreePath[challengesTreePath.length - 1], 1);
      }),
  })),
);

interface ChallengeOptionsProps {
  challenge?: ChallengeNode;
  challengesTreePath: number[];
}

const ChallengeOptions = ({ challenge, challengesTreePath }: ChallengeOptionsProps) => {
  // pkcRpcSettings.challenges is keyed by challenge name, and the builder looks it up before a name
  // has been picked; the lookup already relies on the missing key falling through to the fallback
  const optionInputs: PkcRpcChallengeOptionInput[] = pkcRpcSettings?.challenges?.[challenge?.name as string]?.optionInputs || [];
  const updateChallenge = useChallengesStore((state) => state.updateChallenge);

  if (!challenge?.name) {
    return '';
  }

  return (
    <div className={styles.challengeOptions}>
      {optionInputs?.map((optionInput) => (
        <div className={styles.challengeOption}>
          <div className={styles.challengeTitle}>{optionInput?.label}</div>
          <div>{optionInput?.description}</div>
          <div>
            <input
              className={styles.challengeInput}
              onChange={(e) => updateChallenge(challengesTreePath, { options: { ...challenge.options, [optionInput.option]: e.target.value } })}
              placeholder={optionInput?.placeholder}
              defaultValue={challenge?.options?.[optionInput.option]}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

interface ChallengeProps {
  challengesTree: ChallengeNode;
  challengesTreePath: number[];
}

const Challenge = ({ challengesTree, challengesTreePath }: ChallengeProps) => {
  // the challenges tree node is either a single challenge leaf, or multiple challenges node
  const challenges = challengesTree.challenges;
  const challenge = !challenges ? challengesTree : undefined;
  const isSingleChallenge = !!challenge;
  const { description }: PkcRpcChallengeSettings = pkcRpcSettings?.challenges?.[challenge?.name as string] || {};

  const appendChildChallenge = useChallengesStore((state) => state.appendChildChallenge);
  const appendChallenge = useChallengesStore((state) => state.appendChallenge);
  const updateChallenge = useChallengesStore((state) => state.updateChallenge);
  const removeChallenge = useChallengesStore((state) => state.removeChallenge);
  const appendExclude = () => updateChallenge(challengesTreePath, { exclude: [...(challenge!.exclude || []), {}] });

  const challengeNames = Object.keys(pkcRpcSettings?.challenges || {});

  const onChallengeMoreButton = (e: ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === 'challenge') {
      appendChallenge(challengesTreePath, { name: '', exclude: [] });
    }
    if (e.target.value === 'group') {
      appendChildChallenge(challengesTreePath, { name: '', exclude: [] });
    }
    if (e.target.value === 'exclude') {
      appendExclude();
    }
    if (e.target.value === 'remove') {
      removeChallenge(challengesTreePath);
    }
  };

  return (
    <div className={styles.challenge}>
      {isSingleChallenge && (
        <div>
          <select onChange={onChallengeMoreButton} className={styles.challengeMoreButton} value=''>
            <option hidden value=''>
              ⋮
            </option>
            <option value='group'>add challenge group</option>
            <option value='exclude'>add exclude</option>
            <option value='remove'>remove challenge</option>
          </select>
          {!challenge.name && (
            <select onChange={(e) => updateChallenge(challengesTreePath, { name: e.target.value })} value={challenge.name || ''}>
              <option value='' disabled selected hidden>
                select challenge
              </option>
              {challengeNames.map((challengeName) => (
                <option key={challengeName} value={challengeName}>
                  {challengeName}
                </option>
              ))}
            </select>
          )}
          {challenge.name && <div className={styles.challengeTitle}>{challenge.name}</div>}
          {description && <div>{description}</div>}
          <ChallengeOptions challenge={challenge} challengesTreePath={challengesTreePath} />
          <ChallengeExclude challenge={challenge} challengesTreePath={challengesTreePath} />
        </div>
      )}

      {!isSingleChallenge && (
        <div>
          <select onChange={onChallengeMoreButton} className={styles.challengeMoreButton} value=''>
            <option hidden value=''>
              ⋮
            </option>
            <option value='challenge'>add challenge</option>
            <option value='remove'>remove challenge group</option>
          </select>
          <div>
            <select value={challenges!.combinator} onChange={(e) => updateChallenge(challengesTreePath, { combinator: e.target.value })}>
              <option value='and'>AND</option>
              <option value='or'>OR</option>
            </select>
          </div>
          {challenges!.map((challengesTree, i) => (
            <Challenge key={i} challengesTree={challengesTree} challengesTreePath={[...challengesTreePath, i]} />
          ))}
        </div>
      )}
    </div>
  );
};

const ChallengeBuilder = () => {
  const challengesTree = useChallengesStore((state) => state.challengesTree);
  const challenges = challengesTree.challenges;
  const appendChallenge = useChallengesStore((state) => state.appendChallenge);
  const updateChallenge = useChallengesStore((state) => state.updateChallenge);

  console.log(challenges);

  return (
    <div>
      <div>
        <select value={challengesTree.combinator} onChange={(e) => updateChallenge([], { combinator: e.target.value })}>
          <option value='and'>AND</option>
          <option value='or'>OR</option>
        </select>
        <button onClick={() => appendChallenge([], { name: '', exclude: [] })}>+challenge</button>
      </div>
      {challenges.map((challengesTree, i) => (
        <Challenge key={i} challengesTree={challengesTree} challengesTreePath={[i]} />
      ))}
    </div>
  );
};

export default ChallengeBuilder;
