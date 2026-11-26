import { create } from 'zustand';
import debug from 'debug';
import { redactSecrets, secretReplacer } from '../lib/redact-secrets';

// pkc-js and the hooks log through the shared `debug` module (via @pkcprotocol/pkc-logger). While recording,
// this enables their namespaces and replaces debug's output function, so the /log view shows the
// protocol's own log lines instead of the browser console.

export interface ProtocolLogEntry {
  id: number;
  time: number;
  namespace: string;
  message: string;
  isError: boolean;
}

const RECORDING_KEY = 'bitbonesLogRecording';
// the developer's own localStorage.debug namespaces, put back when recording stops
const PREVIOUS_DEBUG_KEY = 'bitbonesLogPreviousDebug';
const MAX_ENTRIES = 2000;
// trace lines are per-message noise, keep the regular and error levels
const NAMESPACES = 'pkc-js:*,pkc-js-rpc:*,bitsocial-react-hooks:*,-*:trace';

interface ProtocolLogState {
  recording: boolean;
  entries: ProtocolLogEntry[];
  setRecording: (recording: boolean) => void;
  clear: () => void;
}

let nextId = 0;
let pending: ProtocolLogEntry[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | undefined;

const stringifyArg = (arg: unknown): string => {
  if (typeof arg === 'string') {
    return redactSecrets(arg);
  }
  if (arg instanceof Error) {
    return redactSecrets(arg.message);
  }
  try {
    const json = JSON.stringify(arg, secretReplacer);
    const redacted = json ? redactSecrets(json) : String(arg);
    return redacted.length > 300 ? `${redacted.substring(0, 300)}…` : redacted;
  } catch {
    return String(arg);
  }
};

// debug's browser formatter turns a call into ['%cnamespace %cmessage%c +2ms', 'color: …', 'color: inherit', 'color: …', ...rest]
// In the browser, debug substitutes only %j and leaves %s, %d, %i, %f, %o and %O for the console, and
// formatArgs inserts one css argument per %c at that token's position. So the tokens are filled in
// order, as the console would: %c drops its css argument, the others take the next argument, and the
// rest are appended. Only real specifiers count, so text like a percent-encoded /%C3%A9 stays as is.
const isCssArg = (arg: unknown) => typeof arg === 'string' && /^color: /.test(arg);

const formatDebugArgs = (first: string, rest: unknown[]): { text: string; extra: string[] } => {
  let next = 0;
  const text = first.replace(/%([sdifoOcj%])/g, (match, format: string) => {
    if (format === '%') {
      return '%';
    }
    const value = rest[next];
    // %c takes only its css argument and a value specifier never takes one, so literal text such as
    // "50%Off" keeps its characters instead of swallowing debug's styling
    if (next >= rest.length || (format === 'c') !== isCssArg(value)) {
      return match;
    }
    next++;
    return format === 'c' ? '' : stringifyArg(value);
  });
  // a css argument left over (debug places it by counting every %letter) is styling, not content
  const extra = rest.slice(next).filter((arg) => !isCssArg(arg));
  return { text, extra: extra.map(stringifyArg) };
};

const parseDebugArgs = (args: unknown[]): Omit<ProtocolLogEntry, 'id' | 'time'> => {
  const [first, ...rest] = args;
  const { text: formatted, extra } = typeof first === 'string' ? formatDebugArgs(first, rest) : { text: stringifyArg(first), extra: rest.map(stringifyArg) };
  const text = redactSecrets(formatted);
  const spaceIndex = text.indexOf(' ');
  const namespace = spaceIndex > 0 ? text.substring(0, spaceIndex) : '';
  // drop the trailing "+2ms" diff, the entry has its own time
  let message = [text.substring(spaceIndex + 1).replace(/\s*\+\d+(\.\d+)?(ms|s|m|h|d)\s*$/, ''), ...extra].join(' ').trim();
  // some lines carry whole records, keep the log scannable
  if (message.length > 600) {
    message = `${message.substring(0, 600)}… (${message.length} chars)`;
  }
  return { namespace, message, isError: /:error$/.test(namespace) };
};

const flush = () => {
  flushTimeout = undefined;
  const entries = pending;
  pending = [];
  useProtocolLogStore.setState((state) => ({ entries: [...state.entries, ...entries].slice(-MAX_ENTRIES) }));
};

// lines arrive in bursts of hundreds, batch them into one store update
const capture = (...args: unknown[]) => {
  pending.push({ id: nextId++, time: Date.now(), ...parseDebugArgs(args) });
  if (!flushTimeout) {
    flushTimeout = setTimeout(flush, 300);
  }
};

const originalLog = debug.log;
// debug.enable writes localStorage.debug and debug.disable removes it, so a developer's own console
// namespaces are saved when recording starts and enabled again when it stops
const applyRecording = (recording: boolean, resuming = false) => {
  if (recording) {
    try {
      const previous = localStorage.getItem('debug');
      if (!resuming && previous && previous !== NAMESPACES) {
        localStorage.setItem(PREVIOUS_DEBUG_KEY, previous);
      }
    } catch {}
    debug.log = capture;
    debug.enable(NAMESPACES);
  } else {
    debug.disable();
    debug.log = originalLog;
    let previous: string | null = null;
    try {
      previous = localStorage.getItem(PREVIOUS_DEBUG_KEY);
      localStorage.removeItem(PREVIOUS_DEBUG_KEY);
    } catch {}
    if (previous) {
      debug.enable(previous);
    }
  }
};

const readRecording = (): boolean => {
  try {
    return localStorage.getItem(RECORDING_KEY) === 'true';
  } catch {
    return false;
  }
};

const useProtocolLogStore = create<ProtocolLogState>((setState) => ({
  recording: readRecording(),
  entries: [],
  setRecording: (recording) => {
    try {
      localStorage.setItem(RECORDING_KEY, String(recording));
    } catch {}
    applyRecording(recording);
    setState({ recording });
  },
  clear: () => {
    // also drop lines waiting for the next batch, or the flush would bring them back
    pending = [];
    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = undefined;
    }
    setState({ entries: [] });
  },
}));

// resume recording on load, before pkc-js starts logging
if (useProtocolLogStore.getState().recording) {
  applyRecording(true, true);
}

const useProtocolLog = () => {
  const recording = useProtocolLogStore((state) => state.recording);
  const entries = useProtocolLogStore((state) => state.entries);
  const setRecording = useProtocolLogStore((state) => state.setRecording);
  const clear = useProtocolLogStore((state) => state.clear);
  return { recording, entries, setRecording, clear };
};

export const useProtocolLogRecording = (): boolean => useProtocolLogStore((state) => state.recording);

export default useProtocolLog;
