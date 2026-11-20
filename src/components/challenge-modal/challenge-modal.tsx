import { useState, type ChangeEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { useFloating, useDismiss, useRole, useClick, useInteractions, FloatingFocusManager, useId } from '@floating-ui/react';
import type { ChallengeAnswersByIndex } from '@bitsocial/bitsocial-react-hooks';
import styles from './challenge-modal.module.css';
import useChallenges, { type PendingChallenge } from '../../hooks/use-challenges';
import { getChallengeAnswers, getChallengeEntries, getPublicationType, getVotePreview, getPublicationPreview, type ChallengePublication } from './utils';

// the library hands onChallenge an open record, so name the answer-publishing method the modal
// calls on it alongside the preview fields the utils read
type PublishingPublication = ChallengePublication & {
  publishChallengeAnswers(challengeAnswers: ChallengeAnswersByIndex): Promise<void>;
};

interface ChallengeProps {
  challenge: PendingChallenge;
  closeModal: () => void;
  abandonModal: () => void;
}

const Challenge = ({ challenge, closeModal, abandonModal }: ChallengeProps) => {
  // each step of the modal shows one [challengeIndex, challenge] entry
  const challengeEntries = getChallengeEntries(challenge?.[0]?.challenges);
  const publication = challenge?.[1] as PublishingPublication;
  const publicationTarget: ChallengePublication | undefined = challenge?.[2]; // the comment being voted on, replied to or edited
  const publicationType = getPublicationType(publication);
  const publicationPreview = publicationType === 'vote' ? getPublicationPreview(publicationTarget) : getPublicationPreview(publication);
  const parentCommentPreview = publicationType === 'reply' ? getPublicationPreview(publicationTarget) : undefined;
  const votePreview = getVotePreview(publication);

  const [currentStep, setCurrentStep] = useState(0);
  const [challengeIndex, currentChallenge] = challengeEntries[currentStep];
  const [answers, setAnswers] = useState<ChallengeAnswersByIndex>({});
  const onAnswersChange = (e: ChangeEvent<HTMLInputElement>) => {
    setAnswers((prevAnswers) => ({ ...prevAnswers, [challengeIndex]: e.target.value }));
  };
  const onSubmit = () => {
    publication.publishChallengeAnswers(getChallengeAnswers(challengeEntries, answers));
    setAnswers({});
    closeModal();
  };
  const onEnterKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    if (challengeEntries[currentStep + 1]) setCurrentStep((prev) => prev + 1);
    else onSubmit();
  };
  // the next queued challenge renders its cancel button in the same place, so the second click of
  // a double click would cancel that challenge too and delete its pending comment
  const onCancel = (e: MouseEvent<HTMLButtonElement>) => {
    if (e.detail > 1) return;
    abandonModal();
  };

  let challengeComponent;
  if (currentChallenge.type === 'image/png') {
    challengeComponent = <img alt='challenge' className={styles.challengeMedia} src={`data:image/png;base64,${currentChallenge.challenge}`} />;
  }
  // make sure iframe url starts with https:// or not secure
  else if (currentChallenge.type === 'url/iframe' && currentChallenge.challenge?.startsWith('https://')) {
    challengeComponent = (
      <iframe
        height='100%'
        width='100%'
        frameborder='0'
        credentialless
        referrerpolicy='no-referrer'
        title='challenge'
        className={styles.challengeIframe}
        src={currentChallenge.challenge}
      />
    );
  } else {
    // `alt` is not a valid attribute on a div, but React renders it verbatim; spreading it keeps
    // that markup unchanged without declaring `alt` on every element in the app
    challengeComponent = (
      <div {...({ alt: 'challenge' } as Record<string, string>)} className={styles.challengeText}>
        {currentChallenge.challenge}
      </div>
    );
  }

  return (
    <div className={styles.challenge}>
      <div>
        {publicationType}
        {votePreview} in {publication?.shortCommunityAddress}
      </div>
      {parentCommentPreview && <div>to: {parentCommentPreview}</div>}
      <div>{publicationPreview}</div>
      <div className={styles.challengeMediaWrapper}>{challengeComponent}</div>
      {currentChallenge.caseInsensitive && <div>(case insensitive)</div>}
      <div>
        <input onKeyPress={onEnterKey} onChange={onAnswersChange} value={answers[challengeIndex] || ''} className={styles.challengeInput} />
      </div>
      <div className={styles.challengeFooter}>
        <div>
          {currentStep + 1} of {challengeEntries.length}
        </div>
        <span>
          {!challengeEntries[currentStep - 1] && <button onClick={onCancel}>cancel</button>}
          {challengeEntries[currentStep - 1] && <button onClick={() => setCurrentStep((prev) => prev - 1)}>previous</button>}
          {challengeEntries[currentStep + 1] && <button onClick={() => setCurrentStep((prev) => prev + 1)}>next</button>}
          {!challengeEntries[currentStep + 1] && <button onClick={onSubmit}>submit</button>}
        </span>
      </div>
    </div>
  );
};

function ChallengeModal() {
  // bitsocial stuff
  const { challenges, removeChallenge, abandonChallenge } = useChallenges();

  // modal stuff
  const isOpen = !!challenges.length;
  // an answered challenge only leaves the queue; cancel and Escape also abandon its publication
  const closeModal = () => removeChallenge();
  const abandonModal = () => abandonChallenge();

  const { refs, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      if (!open) abandonModal();
    },
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
            <Challenge key={challenges[0].id} challenge={challenges[0].challenge} closeModal={closeModal} abandonModal={abandonModal} />
          </div>
        </FloatingFocusManager>
      )}
    </>
  );
}

export default ChallengeModal;
