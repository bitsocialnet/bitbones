import { create } from 'zustand';
import type { UseRepliesOptions } from '@bitsocial/bitsocial-react-hooks';

const repliesPerPage = 50;
const repliesSortTypesToUseRepliesOptions: Record<string, UseRepliesOptions> = {
  nested: { sortType: 'best', flat: false, repliesPerPage, accountComments: { newerThan: Infinity, append: false } },
  flat: { sortType: 'old', flat: true, repliesPerPage, accountComments: { newerThan: Infinity, append: true } }, // appending is more common when sorting by old
  new: { sortType: 'new', flat: false, repliesPerPage, accountComments: { newerThan: Infinity, append: false } },
  newflat: { sortType: 'new', flat: true, repliesPerPage, accountComments: { newerThan: Infinity, append: false } },
};
const repliesSortTypes = Object.keys(repliesSortTypesToUseRepliesOptions);

interface RepliesSortTypeState {
  repliesSortType: string;
  setRepliesSortType: (repliesSortType: string) => void;
}

const useRepliesSortTypeStore = create<RepliesSortTypeState>((setState, getState) => ({
  repliesSortType: localStorage.getItem('bitbonesRepliesSortType') || 'nested',
  setRepliesSortType: (repliesSortType) => {
    setState((state) => ({ repliesSortType }));
    localStorage.setItem('bitbonesRepliesSortType', repliesSortType);
  },
}));

interface RepliesSortTypeResult {
  repliesSortType: string;
  repliesSortTypes: string[];
  setRepliesSortType: (repliesSortType: string) => void;
  useRepliesOptions: UseRepliesOptions;
}

const useRepliesSortType = (): RepliesSortTypeResult => {
  const { repliesSortType, setRepliesSortType } = useRepliesSortTypeStore();
  return { repliesSortType, repliesSortTypes, setRepliesSortType, useRepliesOptions: repliesSortTypesToUseRepliesOptions[repliesSortType] };
};

export default useRepliesSortType;
