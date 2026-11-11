import { useEffect, useRef, useState } from 'react';
import {
  DocumentCollaboration,
  type CollaborationSnapshot,
} from '@/src/collab/DocumentCollaboration';

/**
 * Owns the collaborative connection of one document for as long as the component is mounted:
 * connect, sync, reconnect, and leave and release everything on unmount. `collab` is undefined
 * until the connection object exists (it is created in an effect, never during render), and
 * always when `enabled` is false (anonymous visitors read the REST copy and never connect).
 */
export function useCollaborativeDocument(
  documentId: number,
  enabled: boolean,
  onSessionExpired?: () => void,
) {
  const [state, setState] = useState<{
    documentId: number;
    collab: DocumentCollaboration;
    snapshot: CollaborationSnapshot;
  }>();
  const expired = useRef(onSessionExpired);
  useEffect(() => {
    expired.current = onSessionExpired;
  });

  useEffect(() => {
    if (!enabled) return;
    const created = new DocumentCollaboration({
      documentId,
      createSocket: () =>
        new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`),
      onSessionExpired: () => expired.current?.(),
    });
    const unsubscribe = created.subscribe(() =>
      setState({ documentId, collab: created, snapshot: created.getSnapshot() }),
    );
    created.start();
    return () => {
      unsubscribe();
      created.dispose();
    };
  }, [documentId, enabled]);

  return enabled && state?.documentId === documentId ? state : undefined;
}
