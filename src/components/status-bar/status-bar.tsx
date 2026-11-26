import { useRef } from 'react';
import { Link } from 'react-router-dom';
import useHeightVariable from '../../hooks/use-height-variable';
import { useAccount } from '@bitsocial/bitsocial-react-hooks';
import { useProtocolLogRecording } from '../../hooks/use-protocol-log';
import useErrors from '../../hooks/use-errors';
import ErrorList from '../error-list';
import styles from './status-bar.module.css';

// pkcOptions keys that list clients, with the label shown for their count
const clientLists: [string, string][] = [
  ['ipfsGatewayUrls', 'ipfs gateways'],
  ['kuboRpcClientsOptions', 'kubo rpc'],
  ['pubsubKuboRpcClientsOptions', 'pubsub providers'],
  ['httpRoutersOptions', 'http routers'],
  ['libp2pJsClientsOptions', 'libp2p-js'],
  ['pkcRpcClientsOptions', 'pkc rpc'],
];

const commitRef = import.meta.env.VITE_COMMIT_REF?.slice(0, 7);
const appVersion = commitRef || `v${import.meta.env.VITE_APP_VERSION}`;

const StatusBar = () => {
  const account = useAccount();
  const recording = useProtocolLogRecording();
  const pkcOptions = account?.pkcOptions || {};
  const unreadNotificationCount = account?.unreadNotificationCount || 0;
  const statusBarRef = useRef<HTMLElement>(null);
  useHeightVariable(statusBarRef, '--statusbar-height');
  const [errors] = useErrors();

  return (
    <footer className={[styles.statusBar, errors.length ? styles.hasErrors : undefined].join(' ')} ref={statusBarRef}>
      <ErrorList />
      <Link to='/profile'>u/{account?.author?.shortAddress || '…'}</Link>
      {unreadNotificationCount > 0 && <Link to='/inbox'>inbox {unreadNotificationCount}</Link>}
      {clientLists.map(([key, label]) =>
        Array.isArray(pkcOptions[key]) && pkcOptions[key].length ? (
          <span key={key}>
            {label} {pkcOptions[key].length}
          </span>
        ) : undefined,
      )}
      {recording && (
        <Link to='/log' className={styles.recording}>
          recording log
        </Link>
      )}
      <span className={styles.spacer} />
      <span>
        pkc-js {import.meta.env.VITE_PKC_JS_VERSION} · hooks {import.meta.env.VITE_HOOKS_VERSION} · bitbones {appVersion}
      </span>
    </footer>
  );
};

export default StatusBar;
