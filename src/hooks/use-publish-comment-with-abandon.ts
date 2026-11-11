import { deleteComment, useAccount, usePublishComment } from '@bitsocial/bitsocial-react-hooks';
import type { AccountComment, Challenge, Comment, PublishCommentOptions, UsePublishCommentResult } from '@bitsocial/bitsocial-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import challengesStore, { type StoppablePublication } from './use-challenges';

const { addChallenge } = challengesStore.getState();

// where a pending comment sits in its account's comments, which is how deleteComment finds it
interface PendingCommentPosition {
  accountName: string | undefined;
  index: number;
  // set by the first cancel, so a second challenge of the same publication can't delete it twice
  abandoned?: boolean;
}

// deleteComment removes the comment at a position and moves every later comment of that account
// down one slot. The library's abandonPublish deletes by the position the comment first had and in
// whichever account is active, so after an earlier delete or an account switch it throws or deletes
// another comment. The positions of all pending comments are kept here instead, and shifted on
// every delete. A published comment's position stays too, since it still holds a slot.
const pendingCommentPositions = new Set<PendingCommentPosition>();

interface DeletedAccountComment {
  accountName: string | undefined;
  index: number;
}

// every delete made here, in order, for pages that show an account comment by its index
const useDeletedAccountCommentsStore = create<{ deletedAccountComments: DeletedAccountComment[] }>(() => ({ deletedAccountComments: [] }));

// publishComment gives the new comment the position after the account comments it read before its
// awaits, so a delete in that window makes it save the comment past the end of the list, and the
// library throws on the gap. And deleteComment rewrites the account's comments in the database, so
// it must not overlap another delete or a publish's first save. Deletes therefore run one at a time,
// only while no publish started here is before its first save, and publishes wait for a running delete.
let startingPublishCount = 0;
let onNoPublishStarting: (() => void)[] = [];
let runningDelete: Promise<unknown> = Promise.resolve();
let lastQueuedDelete: Promise<unknown> = Promise.resolve();

const startPublish = async (publishComment: () => Promise<void>): Promise<void> => {
  startingPublishCount += 1;
  try {
    await runningDelete;
    // the library's publishComment returns once the pending comment is saved
    await publishComment();
  } finally {
    startingPublishCount -= 1;
    if (startingPublishCount === 0) {
      const listeners = onNoPublishStarting;
      onNoPublishStarting = [];
      listeners.forEach((listener) => listener());
    }
  }
};

// resolves to false when the comment is not deleted, because its position was dropped
const deletePosition = async (position: PendingCommentPosition): Promise<boolean> => {
  // dropped after an earlier delete in its account failed
  if (!pendingCommentPositions.delete(position)) {
    return false;
  }
  // deleteComment updates the store before its first await, so shift the other positions right away
  const deleting = deleteComment(position.index, position.accountName);
  runningDelete = deleting.catch(() => undefined);
  for (const otherPosition of pendingCommentPositions) {
    if (otherPosition.accountName === position.accountName && otherPosition.index > position.index) {
      otherPosition.index -= 1;
    }
  }
  // in the same tick as the library's store update, so both reach the same render
  useDeletedAccountCommentsStore.setState(({ deletedAccountComments }) => ({
    deletedAccountComments: [...deletedAccountComments, { accountName: position.accountName, index: position.index }],
  }));
  try {
    await deleting;
  } catch (error) {
    // it may have failed before or after removing the comment, so the account's other positions
    // can't be trusted: drop them, and cancelling their challenges leaves those comments pending
    for (const otherPosition of pendingCommentPositions) {
      if (otherPosition.accountName === position.accountName) {
        pendingCommentPositions.delete(otherPosition);
      }
    }
    throw error;
  }
  return true;
};

// resolves to false when the comment's position was dropped, so nothing is deleted. A second
// cancel of the same publication resolves to true, because the first one handles the delete.
const deletePendingComment = (position: PendingCommentPosition): Promise<boolean> => {
  if (position.abandoned) {
    return Promise.resolve(true);
  }
  position.abandoned = true;
  const deleted = lastQueuedDelete.then(
    () =>
      new Promise<boolean>((resolve, reject) => {
        // called again by the last starting publish once it has saved, in the same tick, so no
        // other publish can start between the check and the delete
        const deleteWhenNoPublishIsStarting = () => {
          if (startingPublishCount > 0) {
            onNoPublishStarting.push(deleteWhenNoPublishIsStarting);
          } else {
            deletePosition(position).then(resolve, reject);
          }
        };
        deleteWhenNoPublishIsStarting();
      }),
  );
  lastQueuedDelete = deleted.catch(() => undefined);
  return deleted;
};

// deleteComment also stops the comment's publication. A skipped or failed delete doesn't, so stop
// it here, or it keeps waiting for answers that never come.
const abandonPendingComment = async (position: PendingCommentPosition, publication: StoppablePublication | undefined): Promise<void> => {
  let deleted: boolean;
  try {
    deleted = await deletePendingComment(position);
  } catch (error) {
    await publication?.stop?.();
    throw error;
  }
  if (!deleted) {
    await publication?.stop?.();
  }
};

// usePublishComment that queues each challenge with a way to delete its pending comment, so
// cancelling the challenge removes the comment instead of leaving it waiting for answers that never come
const usePublishCommentWithAbandon = (publishCommentOptions: PublishCommentOptions | undefined, publicationTarget?: Comment): UsePublishCommentResult => {
  // publish as the active account by name, so the comment is deleted from that account even if
  // another account is active by the time its challenge is cancelled
  const accountName: string | undefined = useAccount()?.name;
  // the position of the comment this hook is publishing, from the library's onPendingComment
  const pendingPositionRef = useRef<PendingCommentPosition | undefined>(undefined);
  const options = useMemo(
    (): PublishCommentOptions | undefined =>
      publishCommentOptions
        ? {
            ...publishCommentOptions,
            accountName,
            onPendingComment: (index: number, pendingComment: AccountComment) => {
              // the library calls this again with the new index if a delete moved the comment while it was being saved
              if (pendingPositionRef.current) {
                pendingPositionRef.current.index = index;
              } else {
                pendingPositionRef.current = { accountName, index };
                pendingCommentPositions.add(pendingPositionRef.current);
              }
              publishCommentOptions.onPendingComment?.(index, pendingComment);
            },
            onChallenge: (challenge: Challenge, publication?: Comment) => {
              const pendingPosition = pendingPositionRef.current;
              addChallenge([challenge, publication, publicationTarget], pendingPosition ? () => abandonPendingComment(pendingPosition, publication) : undefined);
            },
          }
        : undefined,
    [publishCommentOptions, publicationTarget, accountName],
  );
  const publishCommentResult = usePublishComment(options);
  const { index: reportedIndex, publishComment } = publishCommentResult;
  // the comment's recorded index once its publish has settled. A cancel that waited for this
  // comment's first save deletes an earlier comment right then, which moves this one down from the
  // index the library reported.
  const [settledPublish, setSettledPublish] = useState<{ index: number | undefined }>();
  // the library reports no index for a failed publish
  const index = reportedIndex === undefined || !settledPublish ? undefined : (settledPublish.index ?? reportedIndex);
  return useMemo(
    () => ({
      ...publishCommentResult,
      index,
      publishComment: async () => {
        // a new publish gets a new position, and the previous one stays with its queued challenge
        pendingPositionRef.current = undefined;
        setSettledPublish(undefined);
        await startPublish(publishComment);
        // onPendingComment set the position during the await, which TypeScript doesn't see
        setSettledPublish({ index: (pendingPositionRef.current as PendingCommentPosition | undefined)?.index });
      },
    }),
    [publishCommentResult, index, publishComment],
  );
};

// a #/profile/<index> page shows the active account's comment at that index, and a delete moves the
// account's later comments down one slot. This follows the page's comment from the index in the
// route, and moves the route along: down one slot, or to the profile once the comment itself is
// deleted. It reads the deletes in the same render as the library's shifted comments, so the page
// never shows, or redirects to, a comment that has just moved into its slot.
export const useAccountCommentIndexAfterDeletes = (routeIndex: string | undefined): number | undefined => {
  const accountName: string | undefined = useAccount()?.name;
  const navigate = useNavigate();
  const deletedAccountComments = useDeletedAccountCommentsStore((state) => state.deletedAccountComments);
  // deletes from before the page had this index and account are already counted in the index
  const [deletesSince, setDeletesSince] = useState({ routeIndex, accountName, count: deletedAccountComments.length });
  let deletedCountBefore = deletesSince.count;
  if (deletesSince.routeIndex !== routeIndex || deletesSince.accountName !== accountName) {
    deletedCountBefore = deletedAccountComments.length;
    setDeletesSince({ routeIndex, accountName, count: deletedCountBefore });
  }
  // the same parsing useAccountComment does
  const routeIndexNumber = Number(routeIndex);
  let index = Number.isInteger(routeIndexNumber) && routeIndexNumber >= 0 ? routeIndexNumber : undefined;
  let followedPath: string | undefined;
  for (const deleted of deletedAccountComments.slice(deletedCountBefore)) {
    // deleteComment deletes from the active account when it gets no account name
    if (index === undefined || (deleted.accountName !== undefined && deleted.accountName !== accountName)) {
      continue;
    }
    if (index > deleted.index) {
      index -= 1;
      followedPath = `/profile/${index}`;
    } else if (index === deleted.index) {
      index = undefined;
      followedPath = '/profile';
    }
  }
  useEffect(() => {
    if (followedPath) {
      navigate(followedPath, { replace: true });
    }
  }, [followedPath, navigate]);
  return index;
};

export default usePublishCommentWithAbandon;
