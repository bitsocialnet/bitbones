import { useMemo } from 'react';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';

const useCommentLabels = (comment?: Comment, editedCommentState?: string): string[] => {
  return useMemo(() => {
    let editLabel: string | undefined;
    if (editedCommentState === 'succeeded') editLabel = 'edited';
    if (editedCommentState === 'pending') editLabel = 'pending edit';
    if (editedCommentState === 'failed') editLabel = 'failed edit';

    const commentLabels: string[] = [];
    if (comment?.deleted) commentLabels.push('deleted');
    if (comment?.removed) commentLabels.push('removed');
    if (comment?.locked) commentLabels.push('locked');
    if (comment?.spoiler) commentLabels.push('spoiler');
    if (comment?.pinned) commentLabels.push('pinned');
    if (editLabel) commentLabels.push(editLabel);

    return commentLabels;
  }, [comment, editedCommentState]);
};

export default useCommentLabels;
