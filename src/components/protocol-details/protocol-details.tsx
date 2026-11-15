import type { ReactNode } from 'react';
import { useClientsStates } from '@bitsocial/bitsocial-react-hooks';
import type { Comment, Community, UseFeedResult } from '@bitsocial/bitsocial-react-hooks';
import utils from '../../lib/utils';
import styles from './protocol-details.module.css';

// verbose mode blocks: print the protocol data a view was rendered from, field names as pkc-js names them

const getHost = (url: string): string => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};

const formatTime = (timestamp?: number) => (typeof timestamp === 'number' ? `${timestamp} (${utils.getFormattedTime(timestamp)})` : undefined);

interface FieldProps {
  name: string;
  value?: ReactNode;
}

// skip empty values so a line only lists what the record actually has
const Field = ({ name, value }: FieldProps) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return (
    <span className={styles.field}>
      <span className={styles.name}>{name}</span> <span className={styles.value}>{value}</span>
    </span>
  );
};

interface ClientsStatesProps {
  comment?: Comment;
  community?: Community;
}

// which gateway, pubsub provider or name resolver is doing what for this record right now
const ClientsStates = ({ comment, community }: ClientsStatesProps) => {
  const { states, peers } = useClientsStates(comment ? { comment } : community ? { community } : undefined);
  const parts: string[] = [];
  for (const state in states) {
    if (states[state]?.length) {
      parts.push(`${state} ${states[state].map(getHost).join(', ')}`);
    }
  }
  let peerCount = 0;
  for (const clientUrl in peers) {
    peerCount += peers[clientUrl]?.length || 0;
  }
  return (
    <div>
      <Field name='clients' value={parts.join(' · ') || 'idle'} />
      <Field name='peers' value={peerCount || undefined} />
    </div>
  );
};

const commentFlags = ['pinned', 'locked', 'archived', 'removed', 'deleted', 'spoiler', 'nsfw'];

interface CommentDetailsProps {
  comment?: Comment;
  updatedComment?: Comment;
  // replies skip the author/votes line and the client states subscription
  compact?: boolean;
}

export const CommentDetails = ({ comment, updatedComment, compact }: CommentDetailsProps) => {
  if (!comment) {
    return null;
  }
  const updated = updatedComment || comment;
  const flags = commentFlags.filter((flag) => updated?.[flag]).join(' ');
  return (
    <div className={styles.details}>
      <div>
        <Field name='cid' value={comment.cid || (comment.index !== undefined ? `pending, account comment #${comment.index}` : undefined)} />
        <Field name='depth' value={comment.depth} />
        <Field name='protocolVersion' value={comment.protocolVersion} />
        <Field name='signature' value={comment.signature?.type} />
        <Field name='flags' value={flags} />
        {compact && <Field name='updatedAt' value={updated.updatedAt ? utils.getFormattedTime(updated.updatedAt) : undefined} />}
      </div>
      {!compact && (
        <>
          <div>
            <Field name='author.address' value={comment.author?.address} />
            <Field name='timestamp' value={formatTime(comment.timestamp)} />
          </div>
          <div>
            <Field name='updatedAt' value={formatTime(updated.updatedAt) || 'no update yet'} />
            <Field name='upvoteCount' value={updated.upvoteCount} />
            <Field name='downvoteCount' value={updated.downvoteCount} />
            <Field name='replyCount' value={updated.replyCount} />
            <Field name='link' value={comment.link} />
          </div>
          <ClientsStates comment={comment} />
        </>
      )}
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
  const challengeTypes: string[] = [...new Set<string>(community.challenges?.map?.((challenge: { type?: string }) => challenge?.type) || [])];
  const challenges = community.challenges?.length ? `${community.challenges.length} (${challengeTypes.join(', ')})` : undefined;
  const roleCount = community.roles ? Object.keys(community.roles).length : undefined;
  return (
    <div className={styles.details}>
      <div>
        <Field name='address' value={community.address} />
        <Field name='publicKey' value={community.publicKey} />
        <Field name='state' value={community.state} />
        <Field name='updatingState' value={community.updatingState} />
      </div>
      <div>
        <Field name='updatedAt' value={formatTime(community.updatedAt) || 'not loaded'} />
        <Field name='createdAt' value={formatTime(community.createdAt)} />
        <Field name='protocolVersion' value={community.protocolVersion} />
        <Field name='encryption' value={community.encryption?.type} />
      </div>
      <div>
        <Field name='challenges' value={challenges || (community.updatedAt ? 'none' : undefined)} />
        <Field name='roles' value={roleCount} />
        <Field name='pubsubTopic' value={community.pubsubTopic} />
        <Field name='lastPostCid' value={community.lastPostCid} />
        <Field name='statsCid' value={community.statsCid} />
      </div>
      <ClientsStates community={community} />
    </div>
  );
};

interface FeedDetailsProps {
  feedResult: UseFeedResult & { bufferedFeed?: Comment[] };
  communityCount: number;
  sortType: string;
  newerThan?: number;
  stateString?: string;
}

// summary of the useFeed call a feed view renders
export const FeedDetails = ({ feedResult, communityCount, sortType, newerThan, stateString }: FeedDetailsProps) => {
  const { feed, bufferedFeed, hasMore, communityKeysWithMore, communityKeysWithUnavailableSort, communityKeysWithNewerPosts } = feedResult;
  return (
    <div className={[styles.details, styles.feedDetails].join(' ')}>
      <div>
        <span className={styles.name}>useFeed</span> <Field name='communities' value={communityCount} />
        <Field name='sortType' value={sortType} />
        <Field name='newerThan' value={newerThan ? `${newerThan}s` : undefined} />
        <Field name='feed' value={feed?.length || 0} />
        <Field name='bufferedFeed' value={bufferedFeed?.length || 0} />
        <Field name='hasMore' value={String(hasMore)} />
      </div>
      <div>
        <Field name='communityKeysWithMore' value={communityKeysWithMore?.length || undefined} />
        <Field name='communityKeysWithNewerPosts' value={communityKeysWithNewerPosts?.length || undefined} />
        <Field name='communityKeysWithUnavailableSort' value={communityKeysWithUnavailableSort?.length ? communityKeysWithUnavailableSort.join(', ') : undefined} />
      </div>
      {hasMore && (
        <div>
          <Field name='states' value={stateString || 'loading...'} />
        </div>
      )}
    </div>
  );
};
