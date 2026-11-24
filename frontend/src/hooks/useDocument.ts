import { getDocument } from '@/src/documentService';
import { queryKeys, staleTime } from '@/src/queries/keys';
import { useServerQuery } from './useServerQuery';

export function useDocument(id: number) {
  return useServerQuery(queryKeys.document(id), () => getDocument(id), staleTime.document);
}
