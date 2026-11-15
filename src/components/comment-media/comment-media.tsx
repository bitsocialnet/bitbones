import { useState } from 'react';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import utils from '../../lib/utils';
import Embed, { canEmbed } from '../embed';
import styles from './comment-media.module.css';

interface CommentMediaProps {
  comment?: Comment;
  // collapsed by default, a post page opens its own media
  defaultOpen?: boolean;
}

// a comment's linked image, video, audio or embed behind a [+] toggle
const CommentMedia = ({ comment, defaultOpen }: CommentMediaProps) => {
  const [open, setOpen] = useState(!!defaultOpen);
  const link: string | undefined = comment?.link;
  const mediaType = utils.getCommentMediaType(comment);
  let embedUrl: URL | undefined;
  if (!mediaType && link) {
    try {
      const parsedUrl = new URL(link);
      if (canEmbed(parsedUrl)) {
        embedUrl = parsedUrl;
      }
    } catch {}
  }
  if (!link || (!mediaType && !embedUrl)) {
    return null;
  }

  return (
    <div className={styles.commentMedia}>
      <button type='button' className={styles.toggle} aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? '[−]' : '[+]'} {mediaType || 'embed'}
      </button>
      {open && (
        <div className={styles.media}>
          {mediaType === 'image' && (
            <a href={link} target='_blank' rel='noreferrer' title='open full size'>
              <img src={link} alt='' />
            </a>
          )}
          {mediaType === 'video' && <video src={link} controls={true} autoPlay={false} />}
          {mediaType === 'audio' && <audio src={link} controls={true} autoPlay={false} />}
          {embedUrl && <Embed parsedUrl={embedUrl} />}
        </div>
      )}
    </div>
  );
};

export default CommentMedia;
