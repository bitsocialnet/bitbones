import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { create } from 'zustand';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';

// the post or reply shown in the inspector pane, picked by clicking a row. It belongs to the page it was
// picked on, so navigating elsewhere shows that page's default inspector content again.
interface InspectedCommentState {
  comment?: Comment;
  pathname?: string;
  setComment: (comment: Comment | undefined, pathname: string) => void;
}

const useInspectedCommentStore = create<InspectedCommentState>((setState) => ({
  comment: undefined,
  pathname: undefined,
  setComment: (comment, pathname) => setState({ comment, pathname }),
}));

const useInspectedComment = (): [Comment | undefined, (comment?: Comment) => void] => {
  const { pathname } = useLocation();
  const comment = useInspectedCommentStore((state) => (state.pathname === pathname ? state.comment : undefined));
  const setCommentInStore = useInspectedCommentStore((state) => state.setComment);
  const setComment = useCallback((comment?: Comment) => setCommentInStore(comment, pathname), [setCommentInStore, pathname]);
  return [comment, setComment];
};

// whether two snapshots are the same comment, for highlighting the inspected row. A pending comment
// has no cid until it publishes, so the account comment index matches it before and after.
export const isSameComment = (a?: Comment, b?: Comment): boolean => {
  if (!a || !b) {
    return false;
  }
  if (a.cid && b.cid) {
    return a.cid === b.cid;
  }
  return typeof a.index === 'number' && a.index === b.index;
};

export default useInspectedComment;
