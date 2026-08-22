import { useFloating, useDismiss, useRole, useClick, useInteractions, FloatingFocusManager, useId } from '@floating-ui/react';
import styles from './go-to-community-modal.module.css';
import { useNavigate } from 'react-router-dom';
import createStore from 'zustand';

const useCommunityAddress = createStore((setState) => ({
  communityAddress: '',
  setCommunityAddress: (communityAddress) => setState((state) => ({ communityAddress })),
}));

const GoToCommunity = () => {
  const navigate = useNavigate();
  const { communityAddress, setCommunityAddress } = useCommunityAddress();

  const go = (e) => {
    if (e.key === 'Enter' || e.key === undefined) {
      const cleanedCommunityAddress = communityAddress.trim().replace(/^\/?p\//i, '');
      if (cleanedCommunityAddress) {
        navigate(`/p/${cleanedCommunityAddress}`);
      }
    }
  };

  const onChange = (e) => setCommunityAddress(e.target.value);

  return (
    <div className={styles.goToCommunity}>
      <input defaultValue={communityAddress} onChange={onChange} onKeyPress={go} placeholder='address.eth' />
      <button onClick={go}>go</button>
    </div>
  );
};

function GoToCommunityModal({ isOpen, setIsOpen }) {
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
