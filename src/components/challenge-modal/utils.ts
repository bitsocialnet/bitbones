// the library types every publication as an open record, so name the fields the previews below read
export type ChallengePublication = {
  commentCid?: string;
  communityEdit?: unknown;
  content?: string;
  link?: string;
  parentCid?: string;
  shortCommunityAddress?: string;
  title?: string;
  vote?: number;
};

type ChallengeItem = {
  type?: string;
  challenge?: string;
  caseInsensitive?: boolean;
};

// challenge answers keyed by challenge index (the position in community.challenges, as a decimal string)
export type ChallengeAnswersByIndex = { [challengeIndex: string]: string };

// a CHALLENGE lists only the challenges still pending, keyed by challenge index, so the keys can be
// sparse ("1" and "3"); the modal steps through them in challenge index order
export const getChallengeEntries = (challenges: { [challengeIndex: string]: ChallengeItem } | undefined): [string, ChallengeItem][] =>
  Object.entries(challenges || {}).sort(([a], [b]) => Number(a) - Number(b));

// one answer per key of the CHALLENGE, empty for a step left blank (an iframe challenge is solved
// inside the iframe), because a missing key fails that challenge
export const getChallengeAnswers = (challengeEntries: [string, ChallengeItem][], answers: ChallengeAnswersByIndex): ChallengeAnswersByIndex =>
  Object.fromEntries(challengeEntries.map(([challengeIndex]) => [challengeIndex, answers[challengeIndex] || '']));

type PublicationType = 'vote' | 'reply' | 'edit' | 'community edit' | 'post';

export const getPublicationType = (publication: ChallengePublication | undefined): PublicationType | undefined => {
  if (!publication) {
    return;
  }
  if (typeof publication.vote === 'number') {
    return 'vote';
  }
  if (publication.parentCid) {
    return 'reply';
  }
  if (publication.commentCid) {
    return 'edit';
  }
  if (publication.communityEdit) {
    return 'community edit';
  }
  return 'post';
};

export const getVotePreview = (publication: ChallengePublication | undefined): string => {
  if (typeof publication?.vote !== 'number') {
    return '';
  }
  let votePreview = '';
  if (publication.vote === -1) {
    votePreview += ' -1';
  } else {
    votePreview += ` +${publication.vote}`;
  }
  return votePreview;
};

export const getPublicationPreview = (publication: ChallengePublication | undefined): string => {
  if (!publication) {
    return '';
  }
  let publicationPreview = '';
  if (publication.title) {
    publicationPreview += publication.title;
  }
  if (publication.content) {
    if (publicationPreview) {
      publicationPreview += ': ';
    }
    publicationPreview += publication.content;
  }
  if (!publicationPreview && publication.link) {
    publicationPreview += publication.link;
  }

  if (publicationPreview.length > 300) {
    publicationPreview = publicationPreview.substring(0, 300) + '...';
  }
  return publicationPreview;
};
