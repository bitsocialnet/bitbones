import type { ChallengeVerification, Comment, PublishCommentOptions } from '@bitsocial/bitsocial-react-hooks';
import { useMemo } from 'react';
import { create } from 'zustand';
import usePublishCommentWithAbandon from './use-publish-comment-with-abandon';
import { alertChallengeVerificationFailed } from '../lib/utils';
import { incrementReadReplyCount } from './use-unread-reply-count';

interface SetReplyStoreOptions {
  communityAddress?: string;
  parentCid: string;
  content?: string;
  comment?: Comment;
}

interface ReplyState {
  content: Record<string, string | undefined>;
  publishCommentOptions: Record<string, PublishCommentOptions | undefined>;
  // set from the reply click until the library reports the pending comment or fails
  publishing: Record<string, boolean | undefined>;
  setReplyStore: (options: SetReplyStoreOptions) => void;
  resetReplyStore: (parentCid: string) => void;
  setPublishing: (parentCid: string, publishing: boolean) => void;
}

const useReplyStore = create<ReplyState>((setState, getState) => ({
  content: {},
  publishCommentOptions: {},
  publishing: {},
  setReplyStore: ({ communityAddress, parentCid, content, comment }) =>
    setState((state) => {
      const parsedContent = parseContent(content);
      // typed as the library's loose PublishCommentOptions bag: UsePublishCommentOptions declares
      // onChallengeVerification as returning Promise<void>, but the library calls it synchronously
      // and discards the result, so this sync handler does not fit the stricter type.
      // usePublishCommentWithAbandon adds onChallenge.
      const publishCommentOptions: PublishCommentOptions = {
        communityAddress,
        parentCid,
        postCid: comment?.postCid || parentCid,
        content: parsedContent.content,
        link: parsedContent.link,
        // the pending comment holds the draft from here on; reset it here rather than in the reply
        // form's effect, which never runs if the form was closed before the pending index arrived.
        // A draft edited since the publish started, in a reopened form, is a newer one, so keep it.
        onPendingComment: () => {
          if (getState().content[parentCid] === content) {
            getState().resetReplyStore(parentCid);
          }
        },
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
  setPublishing: (parentCid, publishing) => setState((state) => ({ publishing: { ...state.publishing, [parentCid]: publishing } })),
}));

interface Reply {
  content: string | undefined;
  setContent: (content: string) => void;
  resetContent: () => void;
  replyIndex: number | undefined;
  publishing: boolean;
  publishReply: () => Promise<void>;
}

const useReply = (comment?: Comment): Reply => {
  const communityAddress = comment?.communityAddress;
  const parentCid = comment?.cid;
  const content = useReplyStore((state) => state.content[parentCid]);
  const publishCommentOptions = useReplyStore((state) => state.publishCommentOptions[parentCid]);
  const setReplyStore = useReplyStore((state) => state.setReplyStore);
  const resetReplyStore = useReplyStore((state) => state.resetReplyStore);
  const publishing = useReplyStore((state) => Boolean(state.publishing[parentCid]));
  const setPublishing = useReplyStore((state) => state.setPublishing);

  const setContent = useMemo(
    () => (content: string) => setReplyStore({ communityAddress, parentCid, content, comment }),
    [communityAddress, parentCid, setReplyStore, comment],
  );

  const resetContent = useMemo(() => () => resetReplyStore(parentCid), [parentCid, resetReplyStore]);

  const { index, publishComment } = usePublishCommentWithAbandon(publishCommentOptions, comment);

  // before the pending index arrives the library can spend up to 30s loading the community, with
  // nothing changing on screen, and every publishComment call in that window publishes another reply
  const publishReply = async () => {
    if (useReplyStore.getState().publishing[parentCid]) {
      return;
    }
    setPublishing(parentCid, true);
    try {
      await publishComment();
    } finally {
      setPublishing(parentCid, false);
    }
  };

  return { content, setContent, resetContent, replyIndex: index, publishing, publishReply };
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
