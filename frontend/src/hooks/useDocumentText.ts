import { useSyncExternalStore } from 'react';
import type { DocumentCollaboration } from '@/src/collab/DocumentCollaboration';

const noSubscription = () => () => undefined;

/**
 * The shared text of a document, for the few components that show it. Only they re-render as it
 * changes; the page around them does not. Until the server's state has arrived (`live` is false)
 * the REST copy in `fallback` is shown and nothing is subscribed.
 */
export function useDocumentText(
  collab: DocumentCollaboration | undefined,
  live: boolean,
  fallback: string,
) {
  const source = live ? collab : undefined;
  return useSyncExternalStore(
    source ? source.subscribeText : noSubscription,
    source ? source.getText : () => fallback,
    () => fallback,
  );
}
