import utils from '../../../lib/utils';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import styles from './reply-media.module.css';
import { useState, type MouseEvent, type MouseEventHandler } from 'react';
import { useFloating, useDismiss, useRole, useClick, useInteractions, FloatingFocusManager, useId, FloatingOverlay, FloatingPortal } from '@floating-ui/react';

interface MediaModalProps {
  url?: string;
}

function ImageModal({ url }: MediaModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { refs, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
  });

  const click = useClick(context);
  const role = useRole(context);
  const dismiss = useDismiss(context, { outsidePressEvent: 'mousedown' });

  const { getReferenceProps, getFloatingProps } = useInteractions([click, role, dismiss]);

  const refProps = getReferenceProps();
  // prevent opening the reply modal on click
  const onClickAndStopPropagation = (e: MouseEvent<HTMLImageElement>) => {
    // getReferenceProps() is typed as Record<string, unknown>, so its click handler needs the cast
    (refProps.onClick as MouseEventHandler<HTMLImageElement>)(e);
    e.stopPropagation();
  };
  const stopPropagation = (e: MouseEvent<HTMLImageElement>) => e.stopPropagation();

  const headingId = useId();
  const descriptionId = useId();

  return (
    <>
      <div className={styles.replyMediaWrapper}>
        <img ref={refs.setReference} {...refProps} onClick={onClickAndStopPropagation} className={styles.replyMedia} src={url} alt='' />
      </div>
      <FloatingPortal>
        {isOpen && (
          <FloatingOverlay>
            <FloatingFocusManager context={context}>
              <div
                className={[styles.modal, styles.modalMediaWrapper].join(' ')}
                ref={refs.setFloating}
                aria-labelledby={headingId}
                aria-describedby={descriptionId}
                {...getFloatingProps()}
              >
                <img onClick={stopPropagation} className={styles.modalMedia} src={url} alt='' />
              </div>
            </FloatingFocusManager>
          </FloatingOverlay>
        )}
      </FloatingPortal>
    </>
  );
}

function VideoModal({ url }: MediaModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { refs, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
  });

  const click = useClick(context);
  const role = useRole(context);
  const dismiss = useDismiss(context, { outsidePressEvent: 'mousedown' });

  const { getReferenceProps, getFloatingProps } = useInteractions([click, role, dismiss]);

  const refProps = getReferenceProps();
  // prevent opening the reply modal on click
  const onClickAndStopPropagation = (e: MouseEvent<HTMLVideoElement>) => {
    // getReferenceProps() is typed as Record<string, unknown>, so its click handler needs the cast
    (refProps.onClick as MouseEventHandler<HTMLVideoElement>)(e);
    e.stopPropagation();
  };
  const stopPropagation = (e: MouseEvent<HTMLVideoElement>) => e.stopPropagation();

  const headingId = useId();
  const descriptionId = useId();

  return (
    <>
      <div className={styles.replyMediaWrapper}>
        <video ref={refs.setReference} {...refProps} onClick={onClickAndStopPropagation} className={styles.replyMedia} controls={false} autoPlay={false} src={url} />
      </div>
      <FloatingPortal>
        {isOpen && (
          <FloatingOverlay>
            <FloatingFocusManager context={context}>
              <div
                className={[styles.modal, styles.modalMediaWrapper].join(' ')}
                ref={refs.setFloating}
                aria-labelledby={headingId}
                aria-describedby={descriptionId}
                {...getFloatingProps()}
              >
                <video onClick={stopPropagation} className={styles.replyMedia} controls={true} autoPlay={false} src={url} />
              </div>
            </FloatingFocusManager>
          </FloatingOverlay>
        )}
      </FloatingPortal>
    </>
  );
}

interface ReplyMediaProps {
  reply?: Comment;
}

const ReplyMedia = ({ reply }: ReplyMediaProps) => {
  if (!reply?.link) {
    return '';
  }
  const mediaType = utils.getCommentMediaType(reply);
  if (mediaType === 'image') {
    return <ImageModal url={reply?.link} />;
  }
  if (mediaType === 'video') {
    return <VideoModal url={reply?.link} />;
  }
  return (
    <div className={styles.replyLink}>
      <a href={reply?.link} target='_blank' rel='noreferrer'>
        {reply?.link?.trim?.()}
      </a>
    </div>
  );
};

export default ReplyMedia;
