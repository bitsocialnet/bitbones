import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useFloating, useDismiss, useRole, useClick, useInteractions, FloatingFocusManager, useId } from '@floating-ui/react';
import styles from './challenge-modal.module.css';
import useChallenges, { type PendingChallenge } from '../../hooks/use-challenges';
import { getPublicationType, getVotePreview, getPublicationPreview, type ChallengePublication } from './utils';

interface ChallengeItem {
  type?: string;
  challenge?: string;
  caseInsensitive?: boolean;
}

// the library hands onChallenge an open record, so name the answer-publishing method the modal
// calls on it alongside the preview fields the utils read
type PublishingPublication = ChallengePublication & {
  publishChallengeAnswers(challengeAnswers: string[]): Promise<void>;
};

interface ChallengeProps {
  challenge: PendingChallenge;
  closeModal: () => void;
}

const Challenge = ({ challenge, closeModal }: ChallengeProps) => {
  const challenges: ChallengeItem[] = challenge?.[0]?.challenges;
  const publication = challenge?.[1] as PublishingPublication;
  const publicationTarget: ChallengePublication | undefined = challenge?.[2]; // the comment being voted on, replied to or edited
  const publicationType = getPublicationType(publication);
  const publicationPreview = publicationType === 'vote' ? getPublicationPreview(publicationTarget) : getPublicationPreview(publication);
  const parentCommentPreview = publicationType === 'reply' ? getPublicationPreview(publicationTarget) : undefined;
  const votePreview = getVotePreview(publication);

  const [currentChallengeIndex, setCurrentChallengeIndex] = useState(0);
  const defaultAnswers = challenges.map((challenge) => ''); // init with empty strings for pkc-js compatibility
  const [answers, setAnswers] = useState(defaultAnswers);
  const onAnswersChange = (e: ChangeEvent<HTMLInputElement>) => {
    setAnswers((prevAnswers) => {
      const answers = [...prevAnswers];
      answers[currentChallengeIndex] = e.target.value;
      return answers;
    });
  };
  const onSubmit = () => {
    publication.publishChallengeAnswers(answers);
    setAnswers([]);
    closeModal();
  };
  const onEnterKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    if (challenges[currentChallengeIndex + 1]) setCurrentChallengeIndex((prev) => prev + 1);
    else onSubmit();
  };

  let challengeComponent;
  if (challenges[currentChallengeIndex].type === 'image/png') {
    challengeComponent = <img alt='challenge' className={styles.challengeMedia} src={`data:image/png;base64,${challenges[currentChallengeIndex]?.challenge}`} />;
  }
  // make sure iframe url starts with https:// or not secure
  else if (challenges[currentChallengeIndex].type === 'url/iframe' && challenges[currentChallengeIndex]?.challenge?.startsWith('https://')) {
    challengeComponent = (
      <iframe
        height='100%'
        width='100%'
        frameborder='0'
        credentialless
        referrerpolicy='no-referrer'
        title='challenge'
        className={styles.challengeIframe}
        src={challenges[currentChallengeIndex]?.challenge}
      />
    );
  } else {
    // `alt` is not a valid attribute on a div, but React renders it verbatim; spreading it keeps
    // that markup unchanged without declaring `alt` on every element in the app
    challengeComponent = (
      <div {...({ alt: 'challenge' } as Record<string, string>)} className={styles.challengeText}>
        {challenges[currentChallengeIndex]?.challenge}
      </div>
    );
  }

  return (
    <div className={styles.challenge}>
      <div>
        {publicationType}
        {votePreview} in p/{publication?.shortCommunityAddress}
      </div>
      {parentCommentPreview && <div>to: {parentCommentPreview}</div>}
      <div>{publicationPreview}</div>
      <div className={styles.challengeMediaWrapper}>{challengeComponent}</div>
      {challenges[currentChallengeIndex]?.caseInsensitive && <div>(case insensitive)</div>}
      <div>
        <input onKeyPress={onEnterKey} onChange={onAnswersChange} value={answers[currentChallengeIndex] || ''} className={styles.challengeInput} />
      </div>
      <div className={styles.challengeFooter}>
        <div>
          {currentChallengeIndex + 1} of {challenges?.length}
        </div>
        <span>
          {!challenges[currentChallengeIndex - 1] && <button onClick={() => closeModal()}>cancel</button>}
          {challenges[currentChallengeIndex - 1] && <button onClick={() => setCurrentChallengeIndex((prev) => prev - 1)}>previous</button>}
          {challenges[currentChallengeIndex + 1] && <button onClick={() => setCurrentChallengeIndex((prev) => prev + 1)}>next</button>}
          {!challenges[currentChallengeIndex + 1] && <button onClick={onSubmit}>submit</button>}
        </span>
      </div>
    </div>
  );
};

function ChallengeModal() {
  // bitsocial stuff
  const { challenges, removeChallenge } = useChallenges();

  // modal stuff
  const isOpen = !!challenges.length;
  const closeModal = () => removeChallenge();

  const { refs, context } = useFloating({
    open: isOpen,
    onOpenChange: closeModal,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context, { outsidePress: false });
  const role = useRole(context);

  const { getFloatingProps } = useInteractions([click, dismiss, role]);

  const headingId = useId();

  return (
    <>
      {isOpen && (
        <FloatingFocusManager context={context} modal={false}>
          <div className={styles.modal} ref={refs.setFloating} aria-labelledby={headingId} {...getFloatingProps()}>
            <Challenge challenge={challenges[0]} closeModal={closeModal} />
          </div>
        </FloatingFocusManager>
      )}
    </>
  );
}

export default ChallengeModal;
