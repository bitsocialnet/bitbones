import { validateComment } from '@bitsocial/bitsocial-react-hooks';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { setCommentValidator } from './tipping';

// Registers the check of a carrying comment's own signature, which src/lib/tipping.ts runs before it
// trusts the wallets on a comment. Import this module wherever tipping reads wallets off a comment.
// validateComment hashes raw.comment against the cid and verifies the author's and the community's
// signatures offline. It also needs the commentUpdate, so a comment whose update has not arrived is unproven.
setCommentValidator(async (party) => {
  // a loaded comment always has a cid, and the hooks read it into a Comment
  const comment = party as unknown as Comment;
  const validation = await validateComment(comment, { validateReplies: false });
  if (!validation.valid) {
    return validation.reason;
  }
  // the wallets and key read off the comment must be the signed ones, not a wrapper's copy
  const signed = comment.raw?.comment;
  if (JSON.stringify(signed?.author?.wallets) !== JSON.stringify(comment.author?.wallets) || signed?.signature?.publicKey !== comment.signature?.publicKey) {
    return 'the comment does not match its signed record';
  }
  return undefined;
});
