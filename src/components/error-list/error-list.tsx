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

  return (
    <li>
      <span className={styles.context}>{shownError.context}</span> {formatError(shownError.error)}{' '}
      <button type='button' className={styles.linkButton} onClick={copy}>
        {copyResult ?? 'copy full error'}
      </button>{' '}
      <button type='button' className={styles.linkButton} onClick={() => dismissError(shownError.id)}>
        dismiss
      </button>
    </li>
  );
};

// The live region is always rendered, so an error added to it is announced
const ErrorList = () => {
  const [errors, dismissError] = useErrors();
  return (
    <div className={styles.errorList} role='alert'>
      {errors.length > 0 && (
        <ul>
          {errors.map((shownError) => (
            <ErrorRow key={shownError.id} shownError={shownError} dismissError={dismissError} />
          ))}
        </ul>
      )}
    </div>
  );
};

export default ErrorList;
