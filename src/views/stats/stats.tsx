import { Link, useParams } from 'react-router-dom';
import { useAccount, useCommunity, useCommunityStats, useCommunitiesStates } from '@bitsocial/bitsocial-react-hooks';
import useDefaultCommunityAddresses from '../../hooks/use-default-community-addresses';
import useDefaultList from '../../hooks/use-default-list';
import { useCommunityIdentifier, useCommunityIdentifiers } from '../../hooks/use-community-identifier';
import utils from '../../lib/utils';
import styles from './stats.module.css';

// the periods useCommunityStats reports, as in its field names (hourActiveUserCount, dayPostCount...)
const periods = ['hour', 'day', 'week', 'month', 'year', 'all'];
const defaultPeriod = 'day';

interface StatsRowProps {
  communityAddress: string;
  period: string;
}

const StatsRow = ({ communityAddress, period }: StatsRowProps) => {
  const communityIdentifier = useCommunityIdentifier(communityAddress);
  const community = useCommunity(communityIdentifier ? { community: communityIdentifier } : undefined);
  const stats = useCommunityStats(communityIdentifier ? { community: communityIdentifier } : undefined);
  const roleCount = community?.roles ? Object.keys(community.roles).length : undefined;
  return (
    <tr>
      <td>
        <Link to={`/${communityAddress}`}>{communityAddress}</Link>
      </td>
      <td>{community?.title}</td>
      <td className={community?.updatedAt ? undefined : styles.loading}>{community?.updatingState || community?.state}</td>
      <td>{community?.updatedAt ? utils.getFormattedTime(community.updatedAt) : ''}</td>
      <td className={styles.number}>{stats?.[`${period}ActiveUserCount`]}</td>
      <td className={styles.number}>{stats?.[`${period}PostCount`]}</td>
      <td className={styles.number}>{stats?.[`${period}ReplyCount`]}</td>
      <td className={styles.number}>{community?.challenges?.length}</td>
      <td className={styles.number}>{roleCount}</td>
    </tr>
  );
};

interface StatsTableProps {
  communityAddresses: string[];
  period: string;
}

const StatsTable = ({ communityAddresses, period }: StatsTableProps) => (
  <div className={styles.tableWrapper}>
    <table className={styles.table}>
      <thead>
        <tr>
          <th>address</th>
          <th>title</th>
          <th>updatingState</th>
          <th>updatedAt</th>
          <th className={styles.number}>{period}ActiveUserCount</th>
          <th className={styles.number}>{period}PostCount</th>
          <th className={styles.number}>{period}ReplyCount</th>
          <th className={styles.number}>challenges</th>
          <th className={styles.number}>roles</th>
        </tr>
      </thead>
      <tbody>
        {communityAddresses.map((communityAddress) => (
          <StatsRow key={communityAddress} communityAddress={communityAddress} period={period} />
        ))}
      </tbody>
    </table>
  </div>
);

interface CommunitiesStatesTableProps {
  communityAddresses: string[];
}

// which communities are in which loading state, and which clients are serving them
const CommunitiesStatesTable = ({ communityAddresses }: CommunitiesStatesTableProps) => {
  const communities = useCommunityIdentifiers(communityAddresses);
  const { states, peers } = useCommunitiesStates({ communities });
  const stateNames = Object.keys(states || {});
  if (!stateNames.length) {
    return <p>no community is loading</p>;
  }
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>state</th>
            <th>communities</th>
            <th>clients</th>
            <th className={styles.number}>peers</th>
          </tr>
        </thead>
        <tbody>
          {stateNames.map((state) => {
            const { communityAddresses, clientUrls } = states[state];
            const peerCount = clientUrls.reduce((count, clientUrl) => count + (peers?.[clientUrl]?.length || 0), 0);
            return (
              <tr key={state}>
                <td>{state}</td>
                <td className={styles.wrap}>{communityAddresses.join(', ')}</td>
                <td className={styles.wrap}>{clientUrls.map(utils.getHost).join(', ')}</td>
                <td className={styles.number}>{peerCount || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// collect the client urls from pkcOptions without printing anything else in it. Only protocol and host
// are shown: kubo rpc options can carry auth headers, pkc rpc urls carry their auth key in the path,
// provider urls often carry api keys in the path or query, and urls can embed user:password.
const collectUrls = (value: unknown, urls: string[] = []): string[] => {
  if (typeof value === 'string') {
    if (/^(https?|wss?):\/\//.test(value)) {
      try {
        const url = new URL(value);
        urls.push(`${url.protocol}//${url.host}`);
      } catch {}
    }
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, urls));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectUrls(item, urls));
  }
  return urls;
};

const PkcOptionsTable = () => {
  const pkcOptions = useAccount()?.pkcOptions || {};
  const rows = Object.keys(pkcOptions)
    .map((key) => [key, collectUrls(pkcOptions[key])] as const)
    .filter(([, urls]) => urls.length);
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <tbody>
          {rows.map(([key, urls]) => (
            <tr key={key}>
              <td>{key}</td>
              <td className={styles.wrap}>{urls.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

function Stats() {
  const params = useParams<{ period?: string }>();
  const period = params.period && periods.includes(params.period) ? params.period : defaultPeriod;
  const [defaultList] = useDefaultList();
  const defaultCommunityAddresses = useDefaultCommunityAddresses();
  const subscriptions: string[] = useAccount()?.subscriptions || [];

  return (
    <div className={styles.stats}>
      <div className={styles.periods}>
        period:{' '}
        {periods.map((name, index) => (
          <span key={name}>
            {index > 0 && ' · '}
            {name === period ? <b>{name}</b> : <Link to={`/stats/${name}`}>{name}</Link>}
          </span>
        ))}
      </div>

      <h2 className={styles.heading}>
        all, {defaultList} list ({defaultCommunityAddresses.length}) <span className={styles.hook}>useCommunity + useCommunityStats</span>
      </h2>
      <StatsTable communityAddresses={defaultCommunityAddresses} period={period} />

      {subscriptions.length > 0 && (
        <>
          <h2 className={styles.heading}>subs ({subscriptions.length})</h2>
          <StatsTable communityAddresses={subscriptions} period={period} />
        </>
      )}

      <h2 className={styles.heading}>
        loading states <span className={styles.hook}>useCommunitiesStates</span>
      </h2>
      <CommunitiesStatesTable communityAddresses={defaultCommunityAddresses} />

      <h2 className={styles.heading}>
        clients <span className={styles.hook}>account.pkcOptions</span>
      </h2>
      <PkcOptionsTable />
    </div>
  );
}

export default Stats;
