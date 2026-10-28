import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';

export interface Resource<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (value: T) => void;
}

/** Loads a GET endpoint and keeps loading / error / data state. Pass null to skip. */
export function useResource<T>(path: string | null): Resource<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    setError(null);
    try {
      const result = await api<T>(path, { signal: current.signal });
      if (!current.signal.aborted) setData(result);
    } catch (caught: any) {
      if (caught?.name === 'AbortError') return;
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Something went wrong.'));
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}

/** Wraps a mutating call with pending / error state. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    setPending(true);
    setError(null);
    try {
      return await fn(...args);
    } catch (caught: any) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, caught?.message || 'Something went wrong.'));
      return undefined;
    } finally {
      setPending(false);
    }
  }, [fn]);
  return { run, pending, error, clearError: () => setError(null) };
}
