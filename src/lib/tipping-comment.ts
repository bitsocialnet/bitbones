import { validateComment } from '@bitsocial/bitsocial-react-hooks';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { getSignedRecordMismatch, setCommentValidator } from './tipping';

// Registers the check of a carrying comment's own signature, which src/lib/tipping.ts runs before it
// trusts anything a tip reads off a comment. Import this module wherever tipping reads a comment.
// validateComment hashes raw.comment against the cid and verifies the author's and the community's
// signatures offline. With the loaded community, the update must be signed by its current signer, which
// covers delegated and rotated keys and legacy comments. It also needs the commentUpdate, so a comment
// whose update has not arrived is unproven.
setCommentValidator(async (party, community) => {
  // a loaded comment always has a cid, and the hooks read it into a Comment
  const comment = party as unknown as Comment;
  const validation = await validateComment(comment, { validateReplies: false, community });
  if (!validation.valid) {
    return validation.reason;
  }
  // everything tipping reads off the comment must be what was signed, not what a wrapper says
  return getSignedRecordMismatch(comment);
});
