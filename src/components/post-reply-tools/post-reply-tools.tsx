import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useFloating, autoUpdate, offset, shift, useDismiss, useRole, useClick, useInteractions, FloatingFocusManager, useId } from '@floating-ui/react';
import styles from './post-reply-tools.module.css';
import useReply from '../../hooks/use-reply';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';

const getQuote = () => {
  const selection = window.getSelection()!.toString();
  if (selection) {
    return `>${selection}\n\n`;
  }
};

interface MenuProps {
  reply?: Comment;
  onPublished?: () => void;
}

const Menu = ({ reply, onPublished }: MenuProps) => {
  const { content, setContent, resetContent, replyIndex, publishReply } = useReply(reply);

  const onPublish = () => {
    if (!content) {
      alert(`missing content`);
      return;
    }
    publishReply();
  };

  // close and reset modal after publishing
  useEffect(() => {
    if (typeof replyIndex === 'number') {
      onPublished?.();
      resetContent();
    }
  }, [replyIndex, onPublished, resetContent]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // set cursor at end of text
    textareaRef.current!.selectionStart = textareaRef.current!.value.length;
  }, []);

  return (
    <div className={styles.replyToolsMenu}>
      <div>
        <textarea
          ref={textareaRef}
          className={styles.submitContent}
          rows={3}
          placeholder='content'
          defaultValue={content || getQuote()}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
      <div className={styles.submitButtonWrapper}>
        <button onClick={onPublish} className={styles.submitButton}>
          reply
        </button>
      </div>
    </div>
  );
};

interface ReplyToolsProps {
  children?: ReactNode;
  reply?: Comment;
}

function ReplyTools({ children, reply }: ReplyToolsProps) {
  // modal stuff
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    placement: 'bottom',
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [offset(2), shift()],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context);

  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

  const headingId = useId();

  return (
    <>
      <span className={styles.replyToolsButton} ref={refs.setReference} {...getReferenceProps()}>
        {children}
      </span>
      {isOpen && (
        <FloatingFocusManager context={context} modal={false}>
          <div className={styles.modal} ref={refs.setFloating} style={floatingStyles} aria-labelledby={headingId} {...getFloatingProps()}>
            <Menu reply={reply} onPublished={() => setIsOpen(false)} />
          </div>
        </FloatingFocusManager>
      )}
    </>
  );
}

export default ReplyTools;
