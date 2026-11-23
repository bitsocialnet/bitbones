interface SubmitFields {
  title?: string;
  communityAddress?: string;
}

// Link and body are optional: the protocol accepts a post with only a title, and only
// rejects a comment with no content, link, title or crosspost. Kept free of imports so
// scripts/__tests__/validate-submit.node-test.mjs can load it directly.
export const getSubmitError = ({ title, communityAddress }: SubmitFields): string | undefined => {
  if (!title) {
    return 'missing title';
  }
  if (!communityAddress) {
    return 'missing community';
  }
  return undefined;
};
