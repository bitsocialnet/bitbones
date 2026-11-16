import type { ReactNode } from 'react';
import { useClientsStates } from '@bitsocial/bitsocial-react-hooks';
import type { Comment, Community, UseFeedResult } from '@bitsocial/bitsocial-react-hooks';
import utils from '../../lib/utils';
import styles from './protocol-details.module.css';

// protocol data as tables, field names as pkc-js names them

interface PaneHeadingProps {
  children: ReactNode;
}

export const PaneHeading = ({ children }: PaneHeadingProps) => <h2 className={styles.heading}>{children}</h2>;

export interface Field {
  name: string;
  value?: ReactNode;
}

const hasValue = (value: ReactNode) => value !== undefined && value !== null && value !== '' && value !== false;

// rows without a value are skipped, so a table only lists what the record has
interface KeyValueTableProps {
  fields: Field[];
}

export const KeyValueTable = ({ fields }: KeyValueTableProps) => (
  <table className={styles.kv}>
    <tbody>
      {fields
        .filter(({ value }) => hasValue(value))
        .map(({ name, value }) => (
          <tr key={name}>
            <th scope='row'>{name}</th>
            <td>{value}</td>
          </tr>
        ))}
    </tbody>
  </table>
);

// '1794734400 (5 hours ago)'
interface TimestampProps {
  timestamp?: number;
}

export const Timestamp = ({ timestamp }: TimestampProps) => {
  if (typeof timestamp !== 'number') {
    return null;
  }
  return (
    <>
      {timestamp} <span className={styles.dim}>({utils.getFormattedTime(timestamp)})</span>
    </>
  );
};

interface ClientsStatesTableProps {
  comment?: Comment;
  community?: Community;
}

// which gateway, pubsub provider or name resolver is doing what for this record right now
export const ClientsStatesTable = ({ comment, community }: ClientsStatesTableProps) => {
  const { states, peers } = useClientsStates(comment ? { comment } : community ? { community } : undefined);
  const fields: Field[] = [];
  for (const state in states) {
    if (states[state]?.length) {
      fields.push({ name: state, value: states[state].map(utils.getHost).join(', ') });
    }
  }
  let peerCount = 0;
  for (const clientUrl in peers) {
    peerCount += peers[clientUrl]?.length || 0;
  }
  if (peerCount) {
    fields.push({ name: 'peers', value: peerCount });
  }
  if (!fields.length) {
    return <p className={styles.dim}>no client is working on it right now</p>;
  }
  return <KeyValueTable fields={fields} />;
};

interface CommentLineProps {
  comment?: Comment;
  updatedComment?: Comment;
}

// one mono line under a feed row or reply when verbose is on, the inspector has the rest
export const CommentLine = ({ comment, updatedComment }: CommentLineProps) => {
  if (!comment) {
    return null;
  }
  const updated = updatedComment || comment;
  const parts: [string, ReactNode][] = [
    ['cid', comment.cid ? utils.getShortCid(comment.cid) : `pending #${comment.index}`],
    ['v', comment.protocolVersion],
    ['sig', comment.signature?.type],
    ['updatedAt', updated.updatedAt ? `${utils.getShortAge(updated.updatedAt)} ago` : 'none yet'],
    ['votes', typeof updated.upvoteCount === 'number' ? `+${updated.upvoteCount} -${updated.downvoteCount || 0}` : undefined],
    ['flags', utils.getCommentFlags(updated)],
  ];
  return (
    <div className={styles.line}>
      {parts
        .filter(([, value]) => hasValue(value))
        .map(([name, value]) => (
          <span key={name} className={styles.part}>
            <span className={styles.dim}>{name}</span> {value}
          </span>
        ))}
    </div>
  );
};

interface CommunityDetailsProps {
  community?: Community;
}

export const CommunityDetails = ({ community }: CommunityDetailsProps) => {
  if (!community) {
    return null;
  }
  // a challenge's type is the media type of what it asks for (text/plain, image/png, url/iframe)
  const challengeTypes = [...new Set<string>(community.challenges?.map?.((challenge: { type?: string }) => challenge?.type) || [])];
  return (
    <>
      <KeyValueTable
        fields={[
          { name: 'address', value: community.address },
          { name: 'publicKey', value: community.publicKey },
          { name: 'updatingState', value: community.updatingState },
          { name: 'updatedAt', value: community.updatedAt ? <Timestamp timestamp={community.updatedAt} /> : undefined },
          { name: 'createdAt', value: community.createdAt ? <Timestamp timestamp={community.createdAt} /> : undefined },
          { name: 'protocolVersion', value: community.protocolVersion },
          { name: 'encryption', value: community.encryption?.type },
          { name: 'challenges', value: community.challenges?.length ? `${community.challenges.length} (${challengeTypes.join(', ')})` : undefined },
          { name: 'roles', value: community.roles ? Object.keys(community.roles).length : undefined },
          { name: 'lastPostCid', value: community.lastPostCid },
          { name: 'statsCid', value: community.statsCid },
        ]}
      />
      <PaneHeading>clients</PaneHeading>
      <ClientsStatesTable community={community} />
    </>
  );
};

interface FeedDetailsProps {
  feedResult: UseFeedResult & { bufferedFeed?: Comment[] };
  communityCount: number;
  sortType: string;
  newerThan?: number;
  stateString?: string;
}

// the useFeed call behind a feed view and what it returned
export const FeedDetails = ({ feedResult, communityCount, sortType, newerThan, stateString }: FeedDetailsProps) => {
  const { feed, bufferedFeed, hasMore, communityKeysWithMore, communityKeysWithUnavailableSort, communityKeysWithNewerPosts } = feedResult;
  return (
    <>
      <PaneHeading>useFeed</PaneHeading>
      <KeyValueTable
        fields={[
          { name: 'communities', value: communityCount },
          { name: 'sortType', value: sortType },
          { name: 'newerThan', value: newerThan ? `${newerThan}s` : 'unset' },
          { name: 'feed', value: `${feed?.length || 0} posts` },
          { name: 'bufferedFeed', value: `${bufferedFeed?.length || 0} posts` },
          { name: 'hasMore', value: String(hasMore) },
          { name: 'communityKeysWithMore', value: communityKeysWithMore?.length || undefined },
          { name: 'communityKeysWithNewerPosts', value: communityKeysWithNewerPosts?.length || undefined },
          { name: 'communityKeysWithUnavailableSort', value: communityKeysWithUnavailableSort?.length ? communityKeysWithUnavailableSort.join(', ') : undefined },
          { name: 'states', value: hasMore ? stateString || 'loading...' : undefined },
        ]}
      />
      <p className={styles.dim}>click a post to inspect it</p>
    </>
  );
};
