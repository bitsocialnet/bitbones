import { create } from 'zustand';

// verbose mode prints the protocol data behind every view: cids, signatures, client states, hook results
const STORAGE_KEY = 'bitbonesVerbose';

const readStoredVerbose = (): boolean => {
  try {
    // on by default, bitbones is a dev client
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
};

interface VerboseState {
  verbose: boolean;
  setVerbose: (verbose: boolean) => void;
}

const useVerboseStore = create<VerboseState>((setState) => ({
  verbose: readStoredVerbose(),
  setVerbose: (verbose) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(verbose));
    } catch {}
    setState({ verbose });
  },
}));

const useVerbose = (): [boolean, (verbose: boolean) => void] => {
  const verbose = useVerboseStore((state) => state.verbose);
  const setVerbose = useVerboseStore((state) => state.setVerbose);
  return [verbose, setVerbose];
};

export default useVerbose;
