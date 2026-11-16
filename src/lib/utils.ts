import extName from 'ext-name';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';
import memoize from 'memoizee';
import type { ChallengeVerification, Comment, CommentsFilter, Vote } from '@bitsocial/bitsocial-react-hooks';

export type CommentMediaType = 'image' | 'video' | 'audio';

// cache media type because it takes on average 5ms
const getCommentLinkMediaTypeNoCache = (link?: string): CommentMediaType | undefined => {
  if (!link) return;
  let mime;
  try {
    mime = extName(new URL(link).pathname.toLowerCase().replace('/', ''))[0]?.mime;
  } catch (e) {
    return;
  }
  if (mime?.startsWith('image')) return 'image';
  if (mime?.startsWith('video')) return 'video';
  if (mime?.startsWith('audio')) return 'audio';
};
const getCommentLinkMediaType = memoize(getCommentLinkMediaTypeNoCache, { max: 1000 });

export const getCommentMediaType = (comment?: Comment): CommentMediaType | undefined => {
  if (!comment?.link) return;
  if (comment.linkHtmlTagName === 'img') return 'image';
  if (comment.linkHtmlTagName === 'video') return 'video';
  if (comment.linkHtmlTagName === 'audio') return 'audio';
  // never cache getCommentMediaType, only cache getCommentLinkMediaType
  // which uses extName because it's slow
  return getCommentLinkMediaType(comment.link);
};

// bitbones catalog is image/video only, not including thumbnail urls
const catalogFilter = (comment?: Comment): boolean => {
  const mediaType = getCommentMediaType(comment);
  return mediaType === 'image' || mediaType === 'video';
};

// useFeed takes the filter as an object and caches the filtered feed under filter.key, so the key
// identifies what catalogFilter does: change it whenever the predicate's logic changes
export const catalogCommentsFilter: CommentsFilter = { filter: catalogFilter, key: 'catalog' };

TimeAgo.addDefaultLocale(en);
const timeAgo = new TimeAgo('en-US');
// TimeAgo throws a RangeError when timestamp * 1000 is not a finite number, which happens whenever a
// protocol object arrives without a usable timestamp. Return '' rather than undefined so no caller can
// dereference the result of a failed format.
export const getFormattedTime = (timestamp: number): string => {
  try {
    return timeAgo.format(timestamp * 1000);
  } catch (e) {
    console.warn(e, timestamp);
    return '';
  }
};

// 'QmXk9D…rT4p', for tables and one-line summaries where the full cid is in the inspector
export const getShortCid = (cid?: string): string => (cid && cid.length > 14 ? `${cid.substring(0, 6)}…${cid.substring(cid.length - 4)}` : cid || '');

// '41s', '5m', '3h', '2d', '3w', '4mo', '1y', a column-width version of getFormattedTime
export const getShortAge = (timestamp?: number): string => {
  if (typeof timestamp !== 'number') {
    return '';
  }
  const seconds = Math.max(0, Math.round(Date.now() / 1000 - timestamp));
  const units: [number, string][] = [
    [60 * 60 * 24 * 365, 'y'],
    [60 * 60 * 24 * 30, 'mo'],
    [60 * 60 * 24 * 7, 'w'],
    [60 * 60 * 24, 'd'],
    [60 * 60, 'h'],
    [60, 'm'],
  ];
  for (const [unitSeconds, unit] of units) {
    if (seconds >= unitSeconds) {
      return `${Math.floor(seconds / unitSeconds)}${unit}`;
    }
  }
  return `${seconds}s`;
};

export const getHost = (url?: string): string => {
  if (!url) {
    return '';
  }
  try {
    return new URL(url).host.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
};

// 'pinned locked', the moderation and author flags a comment carries
const commentFlags = ['pinned', 'locked', 'archived', 'removed', 'deleted', 'spoiler', 'nsfw'];
export const getCommentFlags = (comment?: Comment): string => commentFlags.filter((flag) => comment?.[flag]).join(' ');

// protocol, host and only paths known to hold no secret (gateway content, kubo rpc and http router
// endpoints). pkc rpc urls carry their auth key in the path, provider urls often carry api keys in the
// path or query, and urls can embed user:password, so everything else is dropped.
const publicUrlPath = /^\/(?:ipfs|ipns)\/|^\/(?:api\/v0|routing\/v1)(?:\/|$)/;
export const getRedactedUrl = (value: string): string => {
  try {
    const url = new URL(value);
    const path = url.pathname === '/' ? '' : publicUrlPath.test(url.pathname) ? url.pathname : '/[redacted]';
    return `${url.protocol}//${url.host}${path}${url.search ? '?[redacted]' : ''}`;
  } catch {
    return '[redacted url]';
  }
};

export const alertChallengeVerificationFailed = (challengeVerification?: ChallengeVerification, publication?: Comment | Vote): void => {
  if (challengeVerification?.challengeSuccess === false) {
    console.warn(challengeVerification, publication);

    alert(
      `p/${publication?.communityAddress} challenge errors: ${[...Object.values(challengeVerification?.challengeErrors || {}), challengeVerification?.reason].join(' ')}`,
    );
  } else {
    console.log(challengeVerification, publication);
  }
};

const utils = {
  getCommentMediaType,
  catalogCommentsFilter,
  getFormattedTime,
  getShortCid,
  getShortAge,
  getHost,
  getCommentFlags,
  getRedactedUrl,
  alertChallengeVerificationFailed,
};

export default utils;
