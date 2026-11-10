import { useState, useEffect, memo } from 'react';
import { useFloating, autoUpdate, offset, flip, shift, useDismiss, useRole, useClick, useInteractions, FloatingFocusManager, useId } from '@floating-ui/react';
import styles from './submit.module.css';
import type { PublishCommentOptions } from '@bitsocial/bitsocial-react-hooks';
import { create } from 'zustand';
import usePublishCommentWithAbandon from '../../../hooks/use-publish-comment-with-abandon';
import { useNavigate, useParams } from 'react-router-dom';
import { isLink, useDefaultAndSubscriptionsCommunities } from './utils';
import type { SubmitCommunity } from './utils';
import { alertChallengeVerificationFailed } from '../../../lib/utils';

interface SetSubmitStoreOptions {
  communityAddress?: string;
  title?: string;
  content?: string;
}

interface SubmitState {
  communityAddress: string | undefined;
  title: string | undefined;
  content: string | undefined;
  // typed as the library's loose PublishCommentOptions bag: UsePublishCommentOptions declares
  // onChallengeVerification as returning Promise<void>, but the library calls it synchronously and
  // discards the result, so this sync handler does not fit the stricter type.
  // usePublishCommentWithAbandon adds onChallenge.
  publishCommentOptions: PublishCommentOptions | undefined;
  setSubmitStore: (options: SetSubmitStoreOptions) => void;
  // the implementation takes no argument, but the redirect effect below calls it with one
  resetSubmitStore: (options?: SetSubmitStoreOptions) => void;
}

const useSubmitStore = create<SubmitState>((setState, getState) => ({
  communityAddress: undefined,
  title: undefined,
  content: undefined,
  publishCommentOptions: undefined,
  setSubmitStore: ({ communityAddress, title, content }) =>
    setState((state) => {
      const nextState = { ...state };
      if (communityAddress !== undefined) {
        nextState.communityAddress = communityAddress;
      }
      if (title !== undefined) {
        nextState.title = title;
      }
      if (content !== undefined) {
        nextState.content = content;
      }
      nextState.publishCommentOptions = {
        communityAddress: nextState.communityAddress,
        title: nextState.title,
        content: nextState.content,
        // the pending post holds the draft from here on; reset it here rather than in the submit
        // form's effect, which never runs if the form was closed before the pending index arrived
        onPendingComment: () => getState().resetSubmitStore(),
        onChallengeVerification: alertChallengeVerificationFailed,
        onError: (error: Error) => {
          console.warn(error);
          alert(error);
        },
      };
      // bitbones only has 1 input for link or content, detect if is link before publishing
      if (isLink(nextState.publishCommentOptions.content)) {
        nextState.publishCommentOptions.link = nextState.publishCommentOptions.content;
        delete nextState.publishCommentOptions.content;
      }
      return nextState;
    }),
  resetSubmitStore: () => setState((state) => ({ communityAddress: undefined, title: undefined, content: undefined, publishCommentOptions: undefined })),
}));

interface SubmitProps {
  onSubmit?: () => void;
}

const Submit = ({ onSubmit }: SubmitProps) => {
  const params = useParams<{ communityAddress?: string }>();
  const communities = useDefaultAndSubscriptionsCommunities();
  const { communityAddress, title, content, publishCommentOptions, setSubmitStore, resetSubmitStore } = useSubmitStore();
  const { index, publishComment } = usePublishCommentWithAbandon(publishCommentOptions);

  const navigate = useNavigate();

  const onPublish = () => {
    if (!title) {
      alert(`missing title`);
      return;
    }
    if (!content) {
      alert(`missing link`);
      return;
    }
    if (!communityAddress) {
      alert(`missing community`);
      return;
    }
    publishComment();
  };

  // redirect to pending post after submitting
  useEffect(() => {
    if (typeof index === 'number') {
      onSubmit?.();
      resetSubmitStore({});
      navigate(`/profile/${index}`);
    }
  }, [index, onSubmit, resetSubmitStore, navigate]);

  return (
    <div className={styles.submit}>
      <CommunitySelect communities={communities} communityAddress={communityAddress || params.communityAddress} setSubmitStore={setSubmitStore} />
      <div>
        {/* set params.communityAddress as default if communityAddress is not yet defined */}
        <input
          onChange={(e) => setSubmitStore({ title: e.target.value, communityAddress: !communityAddress ? params.communityAddress : undefined })}
          defaultValue={title}
          className={styles.submitTitle}
          placeholder='title'
        />
      </div>
      <div>
        <textarea
          onChange={(e) => setSubmitStore({ content: e.target.value, communityAddress: !communityAddress ? params.communityAddress : undefined })}
          defaultValue={content}
          rows={6}
          className={styles.submitContent}
          placeholder='link'
        />
      </div>
      <div className={styles.submitButtonWrapper}>
        <button onClick={onPublish} className={styles.submitButton}>
          submit
        </button>
      </div>
    </div>
  );
};

interface CommunitySelectProps {
  communities: SubmitCommunity[];
  communityAddress?: string;
  setSubmitStore: (options: SetSubmitStoreOptions) => void;
}

const CommunitySelect = memo(({ communities, communityAddress, setSubmitStore }: CommunitySelectProps) => {
  const communitiesOptions = communities.map((community) => (
    <option key={community.address} value={community.address}>
      p/{community.displayAddress}
    </option>
  ));
  communitiesOptions.unshift(
    <option key='p/' value=''>
      p/
    </option>,
  );
  return (
    <div>
      <select
        onChange={(e) => setSubmitStore({ communityAddress: e.target.value })}
        // NOTE: using 'defaultValue' instead of 'value' sometimes causes a bug to render 'p/' even when communityAddress
        // is defined, but it seems to improve performance and the bug doesn't affect UX much
        defaultValue={communityAddress || 'p/'}
        className={styles.submitSelectCommunity}
      >
        {communitiesOptions}
      </select>
    </div>
  );
});

interface SubmitModalProps {
  className?: string;
}

function SubmitModal({ className }: SubmitModalProps) {
  // modal stuff
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    placement: 'bottom',
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [offset(2), flip({ fallbackAxisSideDirection: 'end' }), shift()],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context);

  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

  const headingId = useId();

  const onSubmit = () => setIsOpen(false);

  return (
    <>
      <span className={className} ref={refs.setReference} {...getReferenceProps()}>
        submit
      </span>
      {isOpen && (
        <FloatingFocusManager context={context} modal={false}>
          <div className={styles.modal} ref={refs.setFloating} style={floatingStyles} aria-labelledby={headingId} {...getFloatingProps()}>
            <Submit onSubmit={onSubmit} />
          </div>
        </FloatingFocusManager>
      )}
    </>
  );
}

export default SubmitModal;
