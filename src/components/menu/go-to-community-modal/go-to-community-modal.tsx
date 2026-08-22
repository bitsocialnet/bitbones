import { useFloating, useDismiss, useRole, useClick, useInteractions, FloatingFocusManager, useId } from '@floating-ui/react';
import styles from './go-to-community-modal.module.css';
import { useNavigate } from 'react-router-dom';
import createStore from 'zustand';
import type { ChangeEvent, Dispatch, SetStateAction, SyntheticEvent } from 'react';

interface CommunityAddressState {
  communityAddress: string;
  setCommunityAddress: (communityAddress: string) => void;
}

const useCommunityAddress = createStore<CommunityAddressState>((setState) => ({
  communityAddress: '',
  setCommunityAddress: (communityAddress) => setState((state) => ({ communityAddress })),
}));

const GoToCommunity = () => {
  const navigate = useNavigate();
  const { communityAddress, setCommunityAddress } = useCommunityAddress();

  // serves both the input's onKeyPress and the button's onClick, so the event only sometimes has a key
  const go = (e: SyntheticEvent & { key?: string }) => {
    if (e.key === 'Enter' || e.key === undefined) {
      const cleanedCommunityAddress = communityAddress.trim().replace(/^\/?p\//i, '');
      if (cleanedCommunityAddress) {
        navigate(`/p/${cleanedCommunityAddress}`);
      }
    }
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => setCommunityAddress(e.target.value);

  return (
    <div className={styles.goToCommunity}>
      <input defaultValue={communityAddress} onChange={onChange} onKeyPress={go} placeholder='address.eth' />
      <button onClick={go}>go</button>
    </div>
  );
};

interface GoToCommunityModalProps {
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
}

function GoToCommunityModal({ isOpen, setIsOpen }: GoToCommunityModalProps) {
  const { refs, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context);

  const { getFloatingProps } = useInteractions([click, dismiss, role]);

  const headingId = useId();

  return (
    <>
      {isOpen && (
        <FloatingFocusManager context={context} modal={false}>
          <div className={styles.modal} ref={refs.setFloating} aria-labelledby={headingId} {...getFloatingProps()}>
            <GoToCommunity />
          </div>
        </FloatingFocusManager>
      )}
    </>
  );
}

export default GoToCommunityModal;
