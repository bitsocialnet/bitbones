import { create } from 'zustand';

// Errors of publishing and editing, listed above the status bar until dismissed. They arrive after
// the form that started the action has often closed, and a native alert printed only the name and
// message, so the error itself is kept here and its details, cause and stack can be copied.

export interface ShownError {
  id: number;
  // the call that failed, as the protocol names it, e.g. publishComment
  context: string;
  error: unknown;
}

interface ErrorsState {
  errors: ShownError[];
  dismissError: (id: number) => void;
}

// a burst of failures keeps the newest
const MAX_ERRORS = 5;
let nextId = 0;

const useErrorsStore = create<ErrorsState>((setState) => ({
  errors: [],
  dismissError: (id) => setState((state) => ({ errors: state.errors.filter((shownError) => shownError.id !== id) })),
}));

// in place of alert(error), so it can be called outside React
export const showError = (context: string, error: unknown): void => {
  console.warn(context, error);
  useErrorsStore.setState((state) =>
    // the same error reported twice is listed once
    state.errors.some((shownError) => shownError.context === context && shownError.error === error)
      ? state
      : { errors: [...state.errors, { id: nextId++, context, error }].slice(-MAX_ERRORS) },
  );
};

const useErrors = (): [ShownError[], (id: number) => void] => {
  const errors = useErrorsStore((state) => state.errors);
  const dismissError = useErrorsStore((state) => state.dismissError);
  return [errors, dismissError];
};

export default useErrors;
