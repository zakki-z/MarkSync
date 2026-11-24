import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';

/**
 * Server state behind the `{ data, error, loading, setData }` shape the pages already use. Cached
 * data is returned at once; while a key has nothing cached, `loading` is true. A failed request
 * hides any older data, so an error is never shown next to content that may be out of date.
 */
export function useServerQuery<T>(key: QueryKey, load: () => Promise<T>, staleTime: number) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: key, queryFn: load, staleTime });
  return {
    data: query.isError ? undefined : query.data,
    error: query.error ?? undefined,
    loading: query.isPending,
    setData: (data: T) => client.setQueryData(key, data),
  };
}
