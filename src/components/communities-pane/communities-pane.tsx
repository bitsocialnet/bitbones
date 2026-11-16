import { Link } from 'react-router-dom';
import { useCommunity } from '@bitsocial/bitsocial-react-hooks';
import { useCommunityIdentifier } from '../../hooks/use-community-identifier';
import DefaultListSwitch from '../menu/default-list-switch';
import { PaneHeading } from '../protocol-details';
import utils from '../../lib/utils';
import styles from './communities-pane.module.css';

interface CommunityRowProps {
  communityAddress: string;
}

// a community with the age of its last update, or its updatingState while it has none
const CommunityRow = ({ communityAddress }: CommunityRowProps) => {
  const communityIdentifier = useCommunityIdentifier(communityAddress);
  const community = useCommunity(communityIdentifier ? { community: communityIdentifier } : undefined);
  const loaded = typeof community?.updatedAt === 'number';
  const state = loaded ? utils.getShortAge(community.updatedAt) : community?.updatingState || community?.state || '…';
  const failed = !loaded && /fail/.test(state);
  return (
    <Link to={`/${communityAddress}`} className={styles.row} title={community?.title}>
      <span className={styles.address}>{communityAddress}</span>
      <span className={[styles.state, loaded ? undefined : failed ? styles.failed : styles.loading].join(' ')}>{state}</span>
    </Link>
  );
};

interface CommunitiesPaneProps {
  communityAddresses: string[];
  // the seedit/5chan default list switch, on the home feed
  showListSwitch?: boolean;
  // the hook call that built the feed, printed under the list
  hookCall?: string;
}

const CommunitiesPane = ({ communityAddresses, showListSwitch, hookCall }: CommunitiesPaneProps) => (
  <>
    <div className={styles.heading}>
      <PaneHeading>communities {communityAddresses.length}</PaneHeading>
      {showListSwitch && <DefaultListSwitch />}
    </div>
    {communityAddresses.map((communityAddress) => (
      <CommunityRow key={communityAddress} communityAddress={communityAddress} />
    ))}
    {communityAddresses.length === 0 && <p className={styles.empty}>none yet</p>}
    {hookCall && (
      <>
        <PaneHeading>hook</PaneHeading>
        <pre className={styles.hook}>{hookCall}</pre>
      </>
    )}
  </>
);

export default CommunitiesPane;
