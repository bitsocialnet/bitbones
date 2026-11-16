import { useAccountComment, useComment } from '@bitsocial/bitsocial-react-hooks';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';

// The inspector is handed a comment as it was when its row was clicked. This keeps it current: a
// published comment from the comments store, which keeps receiving updates, and one still publishing
// from the account's comments, where it gains its cid and state.
const useLiveComment = (snapshot?: Comment): Comment | undefined => {
  const pendingIndex = snapshot && !snapshot.cid && typeof snapshot.index === 'number' ? snapshot.index : undefined;
  const accountComment = useAccountComment(pendingIndex !== undefined ? { commentIndex: pendingIndex } : undefined);
  const cid: string | undefined = snapshot?.cid || accountComment?.cid;
  const storedComment = useComment(cid ? { commentCid: cid } : undefined);

  if (!snapshot) {
    return undefined;
  }
  // the stored comment once it has loaded and is at least as recent as what the row had
  if (storedComment?.timestamp && (storedComment.updatedAt || 0) >= (snapshot.updatedAt || 0)) {
    return storedComment;
  }
  if (pendingIndex !== undefined && accountComment?.timestamp) {
    return accountComment;
  }
  return snapshot;
};

export default useLiveComment;
