import { useMemo, useState, useEffect } from 'react';
import styles from './community-settings.module.css';
import { useCommunity, usePublishCommunityEdit, deleteCommunity } from '@bitsocial/bitsocial-react-hooks';
import stringify from 'json-stringify-pretty-compact';
import { useParams, useNavigate } from 'react-router-dom';
import { alertChallengeVerificationFailed } from '../../lib/utils.js';
import useChallenges from '../../hooks/use-challenges.js';
import ChallengeBuilder from './challenge-builder';
import { useCommunityIdentifier } from '../../hooks/use-community-identifier';

// don't publish props that haven't changed, saves bandwidth and avoids uneditable props
const getEditedPropsOnly = (original, edited) => {
  const editedProps = {};
  const allProps = new Set([...Object.keys(original), ...Object.keys(edited)]);
  for (const prop of allProps) {
    if (original[prop] === undefined && edited[prop] === undefined) {
      continue;
    }
    // remove prop
    else if (edited[prop] === undefined) {
      editedProps[prop] = null;
    }
    // add prop
    else if (original[prop] === undefined) {
      editedProps[prop] = edited[prop];
    }
    // edit prop
    else if (JSON.stringify(original[prop]) !== JSON.stringify(edited[prop])) {
      editedProps[prop] = edited[prop];
    }
  }
  return editedProps;
};

const tryJsonParse = (string) => {
  try {
    return JSON.parse(string);
  } catch (e) {}
};

function CommunitySettings() {
  const { addChallenge } = useChallenges();
  const navigate = useNavigate();
  const { communityAddress } = useParams();
  const communityIdentifier = useCommunityIdentifier(communityAddress);
  const community = useCommunity(communityIdentifier ? { community: communityIdentifier } : undefined);
  const communityEditable = {
    ...community.editable,
    // could be useful to show public community.challenges data if private community.settings.challenges isn't defined
    challenges: !community?.settings ? community?.challenges : undefined,
  };
  // eslint-disable-next-line
  const communityJson = useMemo(() => stringify(community.editable), [community]);

  const [text, setText] = useState('');
  const editedCommunity = tryJsonParse(text) || {};

  const { publishCommunityEdit } = usePublishCommunityEdit({
    ...getEditedPropsOnly(communityEditable, editedCommunity),
    communityAddress,
    onChallenge: (...args) => addChallenge([...args, community]),
    onChallengeVerification: alertChallengeVerificationFailed,
    onError: console.warn,
  });

  // set the initial community json
  useEffect(() => {
    setText(communityJson);
  }, [communityJson]);

  const saveCommunity = async () => {
    try {
      // test parsing the options before saving
      JSON.parse(text);

      await publishCommunityEdit();
      alert(`saved`);
    } catch (e) {
      console.warn(e);
      alert(`failed editing community: ${e.message}`);
    }
  };

  const [deleteButtonDisabled, setDeleteButtonDisabled] = useState(false);
  const _deleteCommunity = async () => {
    const confirmed = window.confirm(`delete p/${communityAddress} permanently?`);
    if (!confirmed) {
      return;
    }
    try {
      setDeleteButtonDisabled(true);
      console.log(`deleting ${communityAddress}...`);
      await deleteCommunity(communityAddress);
      console.log(`deleted ${communityAddress}`);
      navigate(`/communities`, { replace: true });
    } catch (e) {
      console.warn(e);
      alert(`failed deleting community: ${e.message}`);
    }
  };

  return (
    <div className={styles.settings}>
      <ChallengeBuilder />
      <textarea onChange={(e) => setText(e.target.value)} autoCorrect='off' rows='24' value={text} />
      <button onClick={saveCommunity}>save</button>
      <button disabled={deleteButtonDisabled} onClick={_deleteCommunity}>
        delete p/{community?.shortAddress}
      </button>
    </div>
  );
}

export default CommunitySettings;
