import { useCallback, useEffect, useState } from 'react';

type Settled<T> = { load: () => Promise<T>; attempt: number; data?: T; error?: Error };

/**
 * Runs `load` whenever its identity changes (pass a stable or memoized function). Until that load
 * settles, `loading` is true and no previous result or error is shown. This includes the very
 * first render, so callers never mistake "not fetched yet" for "fetched nothing".
 */
export function useRemoteData<T>(load: () => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Settled<T>>();

  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => !cancelled && setState({ load, attempt, data }),
      (error: unknown) =>
        !cancelled &&
        setState({
          load,
          attempt,
          error: error instanceof Error ? error : new Error('Request failed'),
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [load, attempt]);

  const settled = state?.load === load && state.attempt === attempt;
  return {
    data: settled ? state.data : undefined,
    error: settled ? state.error : undefined,
    loading: !settled,
    setData: (data: T) => setState({ load, attempt, data }),
    reload: useCallback(() => setAttempt((n) => n + 1), []),
  };
}
