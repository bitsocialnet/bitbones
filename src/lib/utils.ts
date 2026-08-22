import extName from 'ext-name';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';
import memoize from 'memoizee';
import type { ChallengeVerification, Comment, Vote } from '@bitsocial/bitsocial-react-hooks';

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
export const catalogFilter = (comment?: Comment): boolean => {
  const mediaType = getCommentMediaType(comment);
  return mediaType === 'image' || mediaType === 'video';
};

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
  catalogFilter,
  getFormattedTime,
  alertChallengeVerificationFailed,
};

export default utils;
