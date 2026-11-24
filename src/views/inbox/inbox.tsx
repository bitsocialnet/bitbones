import { useNotifications, useAccount } from '@bitsocial/bitsocial-react-hooks';
import { useRef, useEffect } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { StateSnapshot, VirtuosoHandle } from 'react-virtuoso';
import FeedPost from '../../components/feed-post';
import TipNotification from '../../components/tip-notification';
import { getTip } from '../../lib/tipping';
import styles from './inbox.module.css';

let lastVirtuosoState: StateSnapshot | undefined;

function Inbox() {
  const { notifications, markAsRead } = useNotifications();
  const account = useAccount();
  const unreadNotificationCount = account?.unreadNotificationCount;

  // save last virtuoso state on each scroll
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  useEffect(() => {
    const setLastVirtuosoState = () =>
      virtuosoRef.current?.getState((snapshot) => {
        // TODO: not sure if checking for empty snapshot.ranges works for all scenarios
        if (snapshot?.ranges?.length) {
          lastVirtuosoState = snapshot;
        }
      });
    window.addEventListener('scroll', setLastVirtuosoState);
    // clean listener on unmount
    return () => window.removeEventListener('scroll', setLastVirtuosoState);
  }, []);

  if (account && !notifications.length) {
    return 'empty';
  }

  return (
    <div>
      <button onClick={markAsRead} disabled={!unreadNotificationCount} className={styles.markAsReadButton}>
        mark as read
      </button>
      <Virtuoso
        increaseViewportBy={{ bottom: 1200, top: 600 }}
        totalCount={notifications?.length || 0}
        data={notifications}
        itemContent={(index, notification) => (
          <div className={notification.markedAsRead === false ? styles.unreadNotification : styles.readNotification}>
            {/* a reply that carries a tip is checked before it reads as one */}
            {getTip(notification) ? <TipNotification index={index} notification={notification} /> : <FeedPost index={index} post={notification} />}
          </div>
        )}
        useWindowScroll={true}
        ref={virtuosoRef}
        restoreStateFrom={lastVirtuosoState}
        initialScrollTop={lastVirtuosoState?.scrollTop}
      />
    </div>
  );
}

export default Inbox;
