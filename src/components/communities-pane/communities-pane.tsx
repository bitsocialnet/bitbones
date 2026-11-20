import { Link } from 'react-router-dom';
import { useCommunity } from '@bitsocial/bitsocial-react-hooks';
import { useCommunityIdentifier } from '../../hooks/use-community-identifier';
import DefaultListSwitch from '../menu/default-list-switch';
import { PaneHeading } from '../protocol-details';
import utils from '../../lib/utils';
import { formatLoadError, getCommunityLoadError } from '../../lib/load-errors';
import styles from './communities-pane.module.css';

interface CommunityRowProps {
  communityAddress: string;
}

// a community with the age of its last update, or while it has none its updatingState, 'failed' once
// its load failed, or 'retrying' once its first load failed and pkc-js retries it. The error is the
// state's tooltip.
const CommunityRow = ({ communityAddress }: CommunityRowProps) => {
  const communityIdentifier = useCommunityIdentifier(communityAddress);
  const community = useCommunity(communityIdentifier ? { community: communityIdentifier } : undefined);
  const loaded = typeof community?.updatedAt === 'number';
  const loadError = getCommunityLoadError(community);
  let state = community?.updatingState || community?.state || '…';
  if (loaded) {
    state = utils.getShortAge(community.updatedAt);
  } else if (loadError) {
    state = loadError.failed ? 'failed' : 'retrying';
  }
  return (
    <Link to={`/${communityAddress}`} className={styles.row} title={community?.title}>
      <span className={styles.address}>{communityAddress}</span>
      <span
        className={[styles.state, loaded ? undefined : loadError?.failed ? styles.failed : styles.loading].join(' ')}
        title={loadError ? formatLoadError(loadError) : undefined}
      >
        {state}
      </span>
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
