import type { ReactNode } from 'react';
import useWindowWidth from '../../hooks/use-window-width';
import { InspectorMountedContext } from '../../hooks/use-inspector-available';
import styles from './panes.module.css';

interface PanesProps {
  // left pane: the communities behind a feed, or the community a post belongs to
  aside?: ReactNode;
  // label for the collapsed left pane on phones
  asideTitle?: string;
  // right pane: the inspected post or reply
  inspector?: ReactNode;
  children: ReactNode;
}

// three-pane layout. The page scrolls (virtuoso feeds use window scroll), the side panes stick under the topbar.
const Panes = ({ aside, asideTitle, inspector, children }: PanesProps) => {
  const isPhone = useWindowWidth() < 760;
  return (
    <div className={styles.panes} data-panes>
      {aside &&
        (isPhone ? (
          <details className={styles.asidePhone}>
            <summary>{asideTitle || 'details'}</summary>
            {aside}
          </details>
        ) : (
          <aside className={styles.aside}>{aside}</aside>
        ))}
      <div className={styles.content}>
        <InspectorMountedContext.Provider value={!!inspector && !isPhone}>{children}</InspectorMountedContext.Provider>
      </div>
      {inspector && !isPhone && (
        <aside className={styles.inspector} aria-label='inspector'>
          {inspector}
        </aside>
      )}
    </div>
  );
};

export default Panes;
