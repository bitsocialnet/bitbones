import { useMemo, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import useProtocolLog, { type ProtocolLogEntry } from '../../hooks/use-protocol-log';
import styles from './log.module.css';

const filters = [
  { name: 'all', test: () => true },
  { name: 'pkc-js', test: (entry: ProtocolLogEntry) => entry.namespace.startsWith('pkc-js') },
  { name: 'hooks', test: (entry: ProtocolLogEntry) => entry.namespace.startsWith('bitsocial-react-hooks') },
  { name: 'errors', test: (entry: ProtocolLogEntry) => entry.isError },
];

// 12:01:03.402 in local time
const formatTime = (time: number) => {
  const date = new Date(time);
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};

const LogLine = ({ entry }: { entry: ProtocolLogEntry }) => (
  <div className={[styles.line, entry.isError ? styles.error : undefined].join(' ')}>
    <span className={styles.time}>{formatTime(entry.time)}</span>
    <span className={styles.namespace} title={entry.namespace}>
      {entry.namespace}
    </span>
    <span className={styles.message}>{entry.message}</span>
  </div>
);

function Log() {
  const { recording, entries, setRecording, clear } = useProtocolLog();
  const [filterName, setFilterName] = useState('all');
  const [search, setSearch] = useState('');

  // newest first
  const shownEntries = useMemo(() => {
    const filter = filters.find(({ name }) => name === filterName) || filters[0];
    const query = search.trim().toLowerCase();
    return entries.filter((entry) => filter.test(entry) && (!query || `${entry.namespace} ${entry.message}`.toLowerCase().includes(query))).reverse();
  }, [entries, filterName, search]);

  return (
    <div className={styles.log}>
      <div className={styles.toolbar}>
        <button
          type='button'
          className={[styles.button, recording ? styles.recording : undefined].join(' ')}
          onClick={() => setRecording(!recording)}
          aria-pressed={recording}
        >
          {recording ? 'stop recording' : 'record'}
        </button>
        <button type='button' className={styles.button} onClick={clear}>
          clear
        </button>
        <span className={styles.filters}>
          {filters.map(({ name }) => (
            <button
              key={name}
              type='button'
              className={[styles.chip, filterName === name ? styles.on : undefined].join(' ')}
              aria-pressed={filterName === name}
              onClick={() => setFilterName(name)}
            >
              {name}
            </button>
          ))}
        </span>
        <label className={styles.search}>
          <span className={styles.dim}>filter</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder='askseedit.bso' spellCheck={false} />
        </label>
        <span className={styles.dim}>
          {shownEntries.length} of {entries.length} lines, newest first
        </span>
      </div>

      {entries.length === 0 && (
        <p className={styles.dim}>
          {recording
            ? 'recording, waiting for pkc-js and the hooks to log something...'
            : 'record turns on the pkc-js and bitsocial-react-hooks debug logs (trace level excluded) and shows them here instead of the browser console. it keeps recording across reloads until you stop it, and costs some performance while on.'}
        </p>
      )}

      <Virtuoso useWindowScroll={true} data={shownEntries} computeItemKey={(_, entry) => entry.id} itemContent={(_, entry) => <LogLine entry={entry} />} />
    </div>
  );
}

export default Log;
