import { useState, type ChangeEvent } from 'react';
import styles from './challenge-builder.module.css';
import { useChallengesStore } from './challenge-builder';
import type { ChallengeExcludeNode, ChallengeNode } from './challenge-builder';
import pkcRpcSettings from './pkc-rpc-settings-mock';
import type { PkcRpcChallengeOptionInput, PkcRpcChallengeSettings } from '@bitsocial/bitsocial-react-hooks';

interface ChallengeExcludeSelectProps {
  challenge: ChallengeNode;
  challengesTreePath: number[];
  excludeIndex: number;
  excludeName?: string;
}

export const ChallengeExcludeSelect = ({ challenge, challengesTreePath, excludeIndex, excludeName }: ChallengeExcludeSelectProps) => {
  const excludeNames = Object.keys(pkcRpcSettings?.challengeExcludes || {});
  const updateChallenge = useChallengesStore((state) => state.updateChallenge);
  const setChallengeExclude = (e: ChangeEvent<HTMLSelectElement>) => {
    if (!e.target.value) return;
    const excludeCopy = structuredClone(challenge.exclude || []);
    excludeCopy[excludeIndex] = { name: e.target.value };
    updateChallenge(challengesTreePath, { exclude: excludeCopy });
  };

  // no excludes found in pkc rpc settings
  if (!excludeNames.length) {
    return (
      <select>
        <option>no excludes found in pkc rpc settings</option>
      </select>
    );
  }

  return (
    <select onChange={setChallengeExclude} value={excludeName || ''}>
      <option value='' disabled hidden>
        select exclude
      </option>
      {excludeNames.map((name) => (
        <option key={name} value={name}>
          {pkcRpcSettings?.challengeExcludes?.optionInputs?.[name]?.label || name}
        </option>
      ))}
    </select>
  );
};

interface ChallengeExcludeOptionsProps {
  challenge: ChallengeNode;
  challengesTreePath: number[];
  excludeIndex: number;
  excludeName?: string;
}

const ChallengeExcludeOptions = ({ challenge, challengesTreePath, excludeIndex, excludeName }: ChallengeExcludeOptionsProps) => {
  // pkcRpcSettings.challengeExcludes is keyed by exclude name, and the builder looks it up before a
  // name has been picked; the lookup already relies on the missing key falling through to the fallback
  const optionInputs: PkcRpcChallengeOptionInput[] = pkcRpcSettings?.challengeExcludes?.[excludeName as string]?.optionInputs || [];
  const exclude: ChallengeExcludeNode = challenge?.exclude?.[excludeIndex] || {};

  const updateChallenge = useChallengesStore((state) => state.updateChallenge);
  const updateChallengeExclude = (option: string, newValue: string) => {
    const excludeCopy = structuredClone(challenge.exclude || []);
    if (!excludeCopy[excludeIndex]) excludeCopy[excludeIndex] = { name: excludeName, options: {} };
    if (!excludeCopy[excludeIndex].options) excludeCopy[excludeIndex].options = {};
    excludeCopy[excludeIndex].options[option] = newValue;
    updateChallenge(challengesTreePath, { exclude: excludeCopy });
  };

  if (!excludeName) {
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
              onChange={(e) => updateChallengeExclude(optionInput.option, e.target.value)}
              placeholder={optionInput?.placeholder}
              defaultValue={exclude?.options?.[optionInput.option]}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

interface ChallengeExcludeProps {
  challenge: ChallengeNode;
  challengesTreePath: number[];
  // ChallengeExcludeArray also passes the exclude itself, which this component reads back off the challenge
  exclude?: ChallengeExcludeNode;
  excludeIndex: number;
}

const ChallengeExclude = ({ challenge, challengesTreePath, excludeIndex }: ChallengeExcludeProps) => {
  const excludeName = challenge?.exclude?.[excludeIndex]?.name;
  const { label, description }: PkcRpcChallengeSettings = pkcRpcSettings?.challengeExcludes?.[excludeName as string] || {};
  const updateChallenge = useChallengesStore((state) => state.updateChallenge);
  // removeExclude only runs from the list rendered out of challenge.exclude, so the list is there
  const removeExclude = () => updateChallenge(challengesTreePath, { exclude: challenge.exclude!.filter((_, i) => i !== excludeIndex) });

  const onChallengeMoreButton = (e: ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === 'remove') {
      removeExclude();
    }
  };

  return (
    <div className={styles.challenge}>
      <select onChange={onChallengeMoreButton} className={styles.challengeMoreButton} value=''>
        <option hidden value=''>
          ⋮
        </option>
        <option value='remove'>remove exclude</option>
      </select>

      <div>
        {excludeName && <div className={styles.challengeTitle}>exclude {excludeName}</div>}
        {description && <div>{description}</div>}
        <ChallengeExcludeOptions challenge={challenge} challengesTreePath={challengesTreePath} excludeIndex={excludeIndex} excludeName={excludeName} />

        {!excludeName && <ChallengeExcludeSelect challenge={challenge} challengesTreePath={challengesTreePath} excludeIndex={excludeIndex} />}
      </div>
    </div>
  );
};

interface ChallengeExcludeArrayProps {
  challenge: ChallengeNode;
  challengesTreePath: number[];
}

const ChallengeExcludeArray = ({ challenge, challengesTreePath }: ChallengeExcludeArrayProps) => {
  return (
    <div>
      {challenge.exclude?.map((exclude, i) => (
        <ChallengeExclude challenge={challenge} challengesTreePath={challengesTreePath} exclude={exclude} excludeIndex={i} />
      ))}
    </div>
  );
};

export default ChallengeExcludeArray;
