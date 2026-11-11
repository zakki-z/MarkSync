import { useEffect, useState } from 'react';

type Settled<T> = { load: () => Promise<T>; data?: T; error?: Error };

/**
 * Runs `load` whenever its identity changes (pass a stable or memoized function). While a new load
 * is pending, `loading` is true and the previous result is hidden.
 */
export function useRemoteData<T>(load: () => Promise<T>) {
  const [state, setState] = useState<Settled<T>>({ load });

  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => !cancelled && setState({ load, data }),
      (error: unknown) =>
        !cancelled &&
        setState({ load, error: error instanceof Error ? error : new Error('Request failed') }),
    );
    return () => {
      cancelled = true;
    };
  }, [load]);

  const settled = state.load === load;
  return {
    data: settled ? state.data : undefined,
    error: settled ? state.error : undefined,
    loading: !settled,
    setData: (data: T) => setState({ load, data }),
  };
}
