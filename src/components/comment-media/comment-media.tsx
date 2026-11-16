import { useState } from 'react';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import utils from '../../lib/utils';
import Embed, { canEmbed } from '../embed';
import useMediaExpanded from '../../hooks/use-media-expanded';
import styles from './comment-media.module.css';

interface CommentMediaProps {
  comment?: Comment;
  // a post page opens its own media until the expand media setting is changed
  defaultOpen?: boolean;
}

// a comment's linked image, video, audio or embed behind a [+] toggle
const CommentMedia = ({ comment, defaultOpen }: CommentMediaProps) => {
  const { expanded, version } = useMediaExpanded();
  // this toggle's own choice, valid until the expand media setting changes again
  const [toggled, setToggled] = useState<{ open: boolean; version: number }>();
  const open = toggled?.version === version ? toggled.open : expanded || (!!defaultOpen && version === 0);
  const setOpen = (open: boolean) => setToggled({ open, version });
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
