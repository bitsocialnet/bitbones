import { create } from 'zustand';

// whether media starts expanded everywhere. Changing it expands or collapses all media on the page,
// and `version` lets each [+] toggle know its own choice was made before that and no longer applies.
const STORAGE_KEY = 'bitbonesMediaExpanded';

const readStoredExpanded = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

interface MediaExpandedState {
  expanded: boolean;
  version: number;
  setExpanded: (expanded: boolean) => void;
}

const useMediaExpandedStore = create<MediaExpandedState>((setState) => ({
  expanded: readStoredExpanded(),
  version: 0,
  setExpanded: (expanded) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(expanded));
    } catch {}
    setState((state) => ({ expanded, version: state.version + 1 }));
  },
}));

const useMediaExpanded = (): { expanded: boolean; version: number; setExpanded: (expanded: boolean) => void } => {
  const expanded = useMediaExpandedStore((state) => state.expanded);
  const version = useMediaExpandedStore((state) => state.version);
  const setExpanded = useMediaExpandedStore((state) => state.setExpanded);
  return { expanded, version, setExpanded };
};

export default useMediaExpanded;
