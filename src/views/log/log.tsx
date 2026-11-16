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

interface LogLineProps {
  entry: ProtocolLogEntry;
}

const LogLine = ({ entry }: LogLineProps) => (
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
  // Scrolled away from the newest lines, the list holds still: each batch would insert lines above the
  // one being read and the 2000-line cap would drop lines below it, so both wait for "show new lines".
  const [frozenEntries, setFrozenEntries] = useState<ProtocolLogEntry[]>();
  const sourceEntries = frozenEntries ?? entries;

  // newest first
  const shownEntries = useMemo(() => {
    const filter = filters.find(({ name }) => name === filterName) || filters[0];
    const query = search.trim().toLowerCase();
    return sourceEntries.filter((entry) => filter.test(entry) && (!query || `${entry.namespace} ${entry.message}`.toLowerCase().includes(query))).reverse();
  }, [sourceEntries, filterName, search]);

  const newLineCount = useMemo(() => {
    if (!frozenEntries) {
      return 0;
    }
    const lastFrozenId = frozenEntries[frozenEntries.length - 1]?.id ?? -1;
    return entries.filter((entry) => entry.id > lastFrozenId).length;
  }, [entries, frozenEntries]);

  const showNewLines = () => {
    setFrozenEntries(undefined);
    window.scrollTo({ top: 0 });
  };

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
        <button
          type='button'
          className={styles.button}
          onClick={() => {
            clear();
            setFrozenEntries(undefined);
          }}
        >
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
          {shownEntries.length} of {sourceEntries.length} lines, newest first
        </span>
        {newLineCount > 0 && (
          <button type='button' className={[styles.button, styles.recording].join(' ')} onClick={showNewLines}>
            {newLineCount} new {newLineCount === 1 ? 'line' : 'lines'}, show
          </button>
        )}
      </div>

      {entries.length === 0 && (
        <p className={styles.dim}>
          {recording
            ? 'recording, waiting for pkc-js and the hooks to log something...'
            : 'record turns on the pkc-js and bitsocial-react-hooks debug logs (trace level excluded) and shows them here instead of the browser console. it keeps recording across reloads until you stop it, and costs some performance while on.'}
        </p>
      )}

      <Virtuoso
        useWindowScroll={true}
        data={shownEntries}
        computeItemKey={(_, entry) => entry.id}
        itemContent={(_, entry) => <LogLine entry={entry} />}
        atTopThreshold={24}
        atTopStateChange={(atTop) => setFrozenEntries((current) => (atTop ? undefined : (current ?? entries)))}
      />
    </div>
  );
}

export default Log;
