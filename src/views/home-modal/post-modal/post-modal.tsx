import { useFloating, useDismiss, useInteractions, FloatingFocusManager, FloatingOverlay, useId } from '@floating-ui/react';
import styles from './post-modal.module.css';
import Post from '../post';
import { useParams, useNavigate } from 'react-router-dom';
import { useComment } from '@bitsocial/bitsocial-react-hooks';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

// CSSOM exposes the dashed aliases ('overflow-y') next to the camelCase properties, but lib.dom
// only types the camelCase ones
type StyleWithOverflowY = CSSStyleDeclaration & Record<'overflow-y', string>;

interface PostModalProps {
  children?: ReactNode;
}

function PostModal({ children }: PostModalProps) {
  const params = useParams();
  const post = useComment({ commentCid: params.commentCid });

  // modal stuff
  const isOpen = !!params.commentCid;
  const navigate = useNavigate();
  const setIsOpen = () => navigate(-1);

  const { refs, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
  });

  const dismiss = useDismiss(context, {
    // don't close modal when user clicks outside
    outsidePress: false,
  });

  const { getFloatingProps } = useInteractions([dismiss]);

  const headingId = useId();

  // turn off virtuoso scrolling
  useEffect(() => {
    if (isOpen) {
      (document.documentElement.style as StyleWithOverflowY)['overflow-y'] = 'hidden';
    } else {
      (document.documentElement.style as StyleWithOverflowY)['overflow-y'] = 'visible';
    }
    return () => {
      (document.documentElement.style as StyleWithOverflowY)['overflow-y'] = 'visible';
    };
  }, [isOpen]);

  return (
    <FloatingOverlay className={[styles.overlay, !isOpen ? styles.closed : undefined].join(' ')} lockScroll>
      <FloatingFocusManager context={context}>
        <div ref={refs.setFloating} aria-labelledby={headingId} {...getFloatingProps()}>
          <Post post={post} />
        </div>
      </FloatingFocusManager>
    </FloatingOverlay>
  );
}

export default PostModal;
