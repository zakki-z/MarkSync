import { useCallback } from 'react';
import { getDocument } from '@/src/documentService';
import { useRemoteData } from './useRemoteData';

export function useDocument(id: number) {
  return useRemoteData(useCallback(() => getDocument(id), [id]));
}
