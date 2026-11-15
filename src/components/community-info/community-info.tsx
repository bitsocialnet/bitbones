import { Link } from 'react-router-dom';
import { useCommunity, useCommunityStats, useSubscribe } from '@bitsocial/bitsocial-react-hooks';
import { useCommunityIdentifier } from '../../hooks/use-community-identifier';
import { CommunityDetails, PaneHeading } from '../protocol-details';
import styles from './community-info.module.css';

interface CommunityInfoProps {
  communityAddress?: string;
}

// left pane of community and post pages: the community, its rules and its record
const CommunityInfo = ({ communityAddress }: CommunityInfoProps) => {
  const communityIdentifier = useCommunityIdentifier(communityAddress);
  const community = useCommunity(communityIdentifier ? { community: communityIdentifier } : undefined);
  const stats = useCommunityStats(communityIdentifier ? { community: communityIdentifier } : undefined);
  const { subscribed, subscribe, unsubscribe } = useSubscribe({ communityAddress });
  const rules: string[] = Array.isArray(community?.rules) ? community.rules : [];

  return (
    <>
      <div className={styles.header}>
        {community?.suggested?.avatarUrl && <img alt='' className={styles.avatar} src={community.suggested.avatarUrl} />}
        <div className={styles.names}>
          <Link to={`/p/${communityAddress}`} className={styles.address}>
            p/{communityAddress}
          </Link>
          {community?.title && <div className={styles.title}>{community.title}</div>}
        </div>
      </div>
      <div className={styles.actions}>
        <button type='button' onClick={() => (subscribed ? unsubscribe() : subscribe())}>
          {subscribed ? 'leave' : 'join'}
        </button>
        <Link to={`/p/${communityAddress}/settings`}>settings</Link>
      </div>
      <div className={styles.counts}>
        {typeof stats?.allActiveUserCount === 'number' && <span>{stats.allActiveUserCount} members</span>}
        {typeof stats?.hourActiveUserCount === 'number' && <span>{stats.hourActiveUserCount} active this hour</span>}
      </div>
      {community?.description && <p className={styles.description}>{community.description}</p>}
      {rules.length > 0 && (
        <>
          <PaneHeading>rules</PaneHeading>
          <ol className={styles.rules}>
            {rules.map((rule, index) => (
              <li key={index}>{rule?.trim?.()}</li>
            ))}
          </ol>
        </>
      )}
      <PaneHeading>useCommunity</PaneHeading>
      <CommunityDetails community={community} />
    </>
  );
};

export default CommunityInfo;
