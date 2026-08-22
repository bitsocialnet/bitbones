import { usePublishComment } from '@bitsocial/bitsocial-react-hooks';
import type { Challenge, ChallengeVerification, Comment, PublishCommentOptions } from '@bitsocial/bitsocial-react-hooks';
import { useMemo } from 'react';
import { create } from 'zustand';
import challengesStore from './use-challenges';
import { alertChallengeVerificationFailed } from '../lib/utils';
import { incrementReadReplyCount } from './use-unread-reply-count';

const { addChallenge } = challengesStore.getState();

interface SetReplyStoreOptions {
  communityAddress?: string;
  parentCid: string;
  content?: string;
  comment?: Comment;
}

interface ReplyState {
  content: Record<string, string | undefined>;
  publishCommentOptions: Record<string, PublishCommentOptions | undefined>;
  setReplyStore: (options: SetReplyStoreOptions) => void;
  resetReplyStore: (parentCid: string) => void;
}

const useReplyStore = create<ReplyState>((setState, getState) => ({
  content: {},
  publishCommentOptions: {},
  setReplyStore: ({ communityAddress, parentCid, content, comment }) =>
    setState((state) => {
      const parsedContent = parseContent(content);
      // typed as the library's loose PublishCommentOptions bag: UsePublishCommentOptions declares
      // onChallenge/onChallengeVerification as returning Promise<void>, but the library calls them
      // synchronously and discards the result, so these sync handlers do not fit the stricter type.
      const publishCommentOptions: PublishCommentOptions = {
        communityAddress,
        parentCid,
        postCid: comment?.postCid || parentCid,
        content: parsedContent.content,
        link: parsedContent.link,
        onChallenge: (...args: [Challenge, Comment?]) => addChallenge([...args, comment]),
        onChallengeVerification: (challengeVerification: ChallengeVerification, comment?: Comment) => {
          if (challengeVerification?.challengeSuccess === true && comment?.postCid) {
            incrementReadReplyCount(comment.postCid);
          }
          alertChallengeVerificationFailed(challengeVerification, comment);
        },
        onError: (error: Error) => {
          console.warn(error);
          alert(error);
        },
      };
      return {
        content: { ...state.content, [parentCid]: content },
        publishCommentOptions: { ...state.publishCommentOptions, [parentCid]: publishCommentOptions },
      };
    }),
  resetReplyStore: (parentCid) =>
    setState((state) => ({
      content: { ...state.content, [parentCid]: undefined },
      publishCommentOptions: { ...state.publishCommentOptions, [parentCid]: undefined },
    })),
}));

interface Reply {
  content: string | undefined;
  setContent: (content: string) => void;
  resetContent: () => void;
  replyIndex: number | undefined;
  publishReply: () => Promise<void>;
}

const useReply = (comment?: Comment): Reply => {
  const communityAddress = comment?.communityAddress;
  const parentCid = comment?.cid;
  const content = useReplyStore((state) => state.content[parentCid]);
  const publishCommentOptions = useReplyStore((state) => state.publishCommentOptions[parentCid]);
  const setReplyStore = useReplyStore((state) => state.setReplyStore);
  const resetReplyStore = useReplyStore((state) => state.resetReplyStore);

  const setContent = useMemo(
    () => (content: string) => setReplyStore({ communityAddress, parentCid, content, comment }),
    [communityAddress, parentCid, setReplyStore, comment],
  );

  const resetContent = useMemo(() => () => resetReplyStore(parentCid), [parentCid, resetReplyStore]);

  const { index, publishComment } = usePublishComment(publishCommentOptions);

  return { content, setContent, resetContent, replyIndex: index, publishReply: publishComment };
};

export default useReply;

interface ParsedContent {
  content?: string;
  link?: string;
}

const parseContent = (content?: string): ParsedContent => {
  const parsed: ParsedContent = {};
  if (!content) {
    return parsed;
  }

  // starts with https:// so contains link
  if (/^https:\/\//i.test(content)) {
    const separatorIndex = content.match(/[ \n]/)?.index;

    // has both content and link
    if (separatorIndex) {
      parsed.link = content.substring(0, separatorIndex);
      const parsedContent = content.substring(separatorIndex)?.trim();
      // content isn't empty
      if (parsedContent) {
        parsed.content = parsedContent;
      }
    }
    // only has link
    else {
      parsed.link = content;
    }
  } else {
    parsed.content = content;
  }
  return parsed;
};
