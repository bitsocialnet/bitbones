import { useMemo, useState, useRef } from 'react';
import styles from './communities.module.css';
import { useAccountCommunities, useCreateCommunity } from '@bitsocial/bitsocial-react-hooks';
import Community from './community';

function Communities() {
  const [title, setTitle] = useState<string>();
  const { createCommunity } = useCreateCommunity({ title });
  const { accountCommunities } = useAccountCommunities();
  const accountCommunitiesArray = useMemo(() => Object.values(accountCommunities), [accountCommunities]);

  const inputRef = useRef<HTMLInputElement>(null);

  const create = () => {
    createCommunity();
    setTitle('');
    // the input is always rendered, so the ref is set by the time the create button can be clicked
    inputRef.current!.value = '';
  };

  return (
    <div className={styles.communities}>
      <input ref={inputRef} onChange={(e) => setTitle(e.target.value)} placeholder='title' />
      <button onClick={create}>+create</button>
      {accountCommunitiesArray.map((community) => (
        <Community key={community.address} community={community} />
      ))}
    </div>
  );
}

export default Communities;
