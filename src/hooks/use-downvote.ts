import type { Comment, Community } from '@bitsocial/bitsocial-react-hooks';
import useVote from './use-vote';

const useDownvote = (comment?: Comment | Community): [boolean, () => Promise<void>] => useVote(comment, -1);

export default useDownvote;
