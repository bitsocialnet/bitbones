import { useEffect, useRef, useState } from 'react';
import useErrors from '../../hooks/use-errors';
import type { ShownError } from '../../hooks/use-errors';
import { formatError, serializeError } from '../../lib/error-utils';
import styles from './error-list.module.css';

interface ErrorRowProps {
  shownError: ShownError;
  dismissError: (id: number) => void;
}

const ErrorRow = ({ shownError, dismissError }: ErrorRowProps) => {
  const [copyResult, setCopyResult] = useState<'copied' | 'copy failed'>();
  const resetTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(resetTimeout.current), []);

  const copy = () => {
    // the clipboard is missing outside a secure context, which rejects here like a refused write
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(serializeError(shownError.error)))
      .then(
        () => 'copied' as const,
        () => 'copy failed' as const,
      )
      .then((result) => {
        setCopyResult(result);
        clearTimeout(resetTimeout.current);
        resetTimeout.current = setTimeout(() => setCopyResult(undefined), 1500);
      });
  };

  // A row's error text is its own alert, announced once when the row is added. The buttons sit outside
  // it, so a copy result does not read the error again, and the result has its own polite region.
  return (
    <li>
      <span role='alert'>
        <span className={styles.context}>{shownError.context}</span> {formatError(shownError.error)}
      </span>{' '}
      <button type='button' className={styles.linkButton} onClick={copy}>
        <span aria-live='polite'>{copyResult ?? 'copy full error'}</span>
      </button>{' '}
      <button type='button' className={styles.linkButton} onClick={() => dismissError(shownError.id)}>
        dismiss
      </button>
    </li>
  );
};

const ErrorList = () => {
  const [errors, dismissError] = useErrors();
  if (!errors.length) {
    return null;
  }
  return (
    <ul className={styles.errorList}>
      {errors.map((shownError) => (
        <ErrorRow key={shownError.id} shownError={shownError} dismissError={dismissError} />
      ))}
    </ul>
  );
};

export default ErrorList;
