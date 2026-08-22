import { create } from 'zustand';

// which client's default community list the feed uses
const DEFAULT_LISTS = ['seedit', '5chan'];

// seedit is the default because its list is 10 communities against 5chan's 64, and every extra
// community is another name resolution + page fetch on a cold p2p start
const FALLBACK = 'seedit';
const STORAGE_KEY = 'bitbonesDefaultList';

const readStoredList = (): string => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null && DEFAULT_LISTS.includes(stored) ? stored : FALLBACK;
  } catch (e) {
    // safari private mode throws on storage access
    return FALLBACK;
  }
};

interface DefaultListState {
  defaultList: string;
  setDefaultList: (defaultList: string) => void;
}

// read synchronously at module init so the first render already has the right list and the feed
// never mounts against one client's communities and then remounts against the other's
const useDefaultListStore = create<DefaultListState>((setState) => ({
  defaultList: readStoredList(),
  setDefaultList: (defaultList) => {
    if (!DEFAULT_LISTS.includes(defaultList)) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, defaultList);
    } catch (e) {
      console.warn(e);
    }
    setState({ defaultList });
  },
}));

const useDefaultList = (): [string, (defaultList: string) => void] => {
  const { defaultList, setDefaultList } = useDefaultListStore();
  return [defaultList, setDefaultList];
};

export default useDefaultList;
