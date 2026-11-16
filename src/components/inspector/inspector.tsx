import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import stringify from 'json-stringify-pretty-compact';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import useInspectedComment from '../../hooks/use-inspected-comment';
import useLiveComment from '../../hooks/use-live-comment';
import { ClientsStatesTable, KeyValueTable, PaneHeading, Timestamp } from '../protocol-details';
import CommentMedia from '../comment-media';
import utils from '../../lib/utils';
import styles from './inspector.module.css';

const tabs = ['fields', 'clients', 'json'] as const;
type Tab = (typeof tabs)[number];

// for the on-screen json tab only: reply pages can hold hundreds of comments, and long strings drown
// the rest of the record. copy json copies the full record.
const jsonReplacer = (key: string, value: unknown) => {
  if (key === 'replies' && value && typeof value === 'object') {
    return '[reply pages, see useReplies]';
  }
  if (typeof value === 'string' && value.length > 400) {
    return `${value.substring(0, 400)}… (${value.length} chars)`;
  }
  return value;
};

const CommentFields = ({ comment }: { comment: Comment }) => (
  <KeyValueTable
    fields={[
      { name: 'cid', value: comment.cid || `pending, account comment #${comment.index}` },
      { name: 'state', value: comment.cid ? undefined : comment.state },
      { name: 'postCid', value: comment.depth > 0 ? comment.postCid : undefined },
      { name: 'parentCid', value: comment.parentCid },
      { name: 'communityAddress', value: comment.communityAddress },
      { name: 'author.address', value: comment.author?.address },
      { name: 'author.displayName', value: comment.author?.displayName },
      { name: 'timestamp', value: comment.timestamp ? <Timestamp timestamp={comment.timestamp} /> : undefined },
      { name: 'depth', value: comment.depth },
      { name: 'protocolVersion', value: comment.protocolVersion },
      { name: 'signature.type', value: comment.signature?.type },
      { name: 'signature.publicKey', value: comment.signature?.publicKey },
      { name: 'link', value: comment.link },
      { name: 'upvoteCount', value: comment.upvoteCount },
      { name: 'downvoteCount', value: comment.downvoteCount },
      { name: 'replyCount', value: comment.replyCount },
      { name: 'updatedAt', value: comment.updatedAt ? <Timestamp timestamp={comment.updatedAt} /> : 'no update yet' },
      { name: 'flags', value: utils.getCommentFlags(comment) },
      { name: 'reason', value: comment.reason },
    ]}
  />
);

interface InspectorProps {
  // shown when nothing is picked, e.g. the useFeed result on feed pages
  fallback?: ReactNode;
  // inspected when nothing is picked, e.g. the post on a post page
  defaultComment?: Comment;
}

const Inspector = ({ fallback, defaultComment }: InspectorProps) => {
  const [inspectedComment, setInspectedComment] = useInspectedComment();
  const [tab, setTab] = useState<Tab>('fields');
  const comment = useLiveComment(inspectedComment || defaultComment);
  const json = useMemo(() => {
    if (tab !== 'json' || !comment) {
      return '';
    }
    try {
      return stringify(comment, { replacer: jsonReplacer });
    } catch (e) {
      return `could not serialize: ${(e as Error).message}`;
    }
  }, [comment, tab]);

  if (!comment) {
    return <>{fallback}</>;
  }

  const postLink = comment.cid ? `/p/${comment.communityAddress}/c/${comment.postCid || comment.cid}` : `/profile/${comment.index}`;
  const copy = (text?: string) => text && navigator.clipboard?.writeText(text);

  return (
    <div>
      <div className={styles.header}>
        <PaneHeading>{comment.depth > 0 ? `reply · depth ${comment.depth}` : 'post'}</PaneHeading>
        {inspectedComment && (
          <button type='button' className={styles.close} onClick={() => setInspectedComment(undefined)} aria-label='stop inspecting'>
            ×
          </button>
        )}
      </div>
      {comment.title && <div className={styles.title}>{comment.title}</div>}
      <div className={styles.tabs} role='tablist'>
        {tabs.map((name) => (
          <button
            key={name}
            type='button'
            role='tab'
            aria-selected={tab === name}
            className={[styles.tab, tab === name ? styles.current : undefined].join(' ')}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {tab === 'fields' && <CommentFields comment={comment} />}
      {tab === 'clients' && <ClientsStatesTable comment={comment} />}
      {tab === 'json' && <pre className={styles.json}>{json}</pre>}
      {tab === 'fields' && <CommentMedia comment={comment} />}
      <div className={styles.actions}>
        <Link to={postLink}>open</Link>
        {comment.cid && (
          <button type='button' onClick={() => copy(comment.cid)}>
            copy cid
          </button>
        )}
        <button type='button' onClick={() => copy(JSON.stringify(comment, null, 2))}>
          copy json
        </button>
        {/* a pending comment has no cid yet, so its author link has none either */}
        {comment.author?.address && <Link to={comment.cid ? `/u/${comment.author.address}/c/${comment.cid}` : `/u/${comment.author.address}`}>author history</Link>}
        {comment.link && (
          <a href={comment.link} target='_blank' rel='noreferrer'>
            {utils.getHost(comment.link)}
          </a>
        )}
      </div>
    </div>
  );
};

export default Inspector;
