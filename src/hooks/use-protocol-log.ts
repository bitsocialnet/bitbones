import { create } from 'zustand';
import debug from 'debug';
import utils from '../lib/utils';

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

// The hooks log whole account objects, which hold the signer's private key, and pkcOptions, whose kubo
// rpc options can carry authorization headers. Never show anything that looks like a secret.
// Key names are matched whole, so `author` and `authorAddress` stay visible.
const SECRET_KEY_NAMES = 'privateKey|password|passphrase|secret|authKey|pkcRpcAuthKey|authorization|auth|headers|mnemonic|seed|token|apiKey|api_key';
const SECRET_KEY = new RegExp(`^(?:${SECRET_KEY_NAMES})$`, 'i');
const SECRET_FIELD = new RegExp(
  `((?:"|')?\\b(?:${SECRET_KEY_NAMES})(?:"|')?\\s*[:=]\\s*)(\\{[^{}]*\\}|"[^"]*"|'[^']*'|(?:Bearer|Basic|Token)\\s+[^\\s,}]+|[^\\s,}]+)`,
  'gi',
);
const URL_PATTERN = /\b(?:https?|wss?):\/\/[^\s"'<>]+/g;
const redactSecrets = (text: string) => text.replace(SECRET_FIELD, '$1"[redacted]"').replace(URL_PATTERN, (url) => utils.getRedactedUrl(url));
const secretReplacer = (key: string, value: unknown) => (SECRET_KEY.test(key) ? '[redacted]' : value);

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
const parseDebugArgs = (args: unknown[]): Omit<ProtocolLogEntry, 'id' | 'time'> => {
  const [first, ...rest] = args;
  const text = typeof first === 'string' ? redactSecrets(first.replace(/%c/g, '')) : stringifyArg(first);
  const extra = rest.filter((arg) => !(typeof arg === 'string' && /^color: /.test(arg))).map(stringifyArg);
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
