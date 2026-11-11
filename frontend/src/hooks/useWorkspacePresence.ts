import { useCallback, useEffect, useRef, useState } from 'react';
import {
  INITIAL_SNAPSHOT,
  WorkspacePresenceClient,
  type PresenceSnapshot,
} from '@/src/presence/WorkspacePresenceClient';

/**
 * Owns the workspace presence socket for as long as the component is mounted: connect, join,
 * heartbeat, reconnect, and leave on unmount. `send` is false until the server has confirmed the join.
 */
export function useWorkspacePresence(workspaceId: number, onSessionExpired?: () => void) {
  const [state, setState] = useState({ workspaceId, snapshot: INITIAL_SNAPSHOT });
  const client = useRef<WorkspacePresenceClient>(undefined);
  const expired = useRef(onSessionExpired);
  useEffect(() => {
    expired.current = onSessionExpired;
  });

  useEffect(() => {
    const created = new WorkspacePresenceClient({
      workspaceId,
      createSocket: () =>
        new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`),
      onSessionExpired: () => expired.current?.(),
    });
    client.current = created;
    const unsubscribe = created.subscribe(() =>
      setState({ workspaceId, snapshot: created.getSnapshot() }),
    );
    created.start();
    return () => {
      unsubscribe();
      created.dispose();
      client.current = undefined;
    };
  }, [workspaceId]);

  const send = useCallback((text: string) => client.current?.send(text) ?? false, []);
  const snapshot: PresenceSnapshot =
    state.workspaceId === workspaceId ? state.snapshot : INITIAL_SNAPSHOT;
  return { ...snapshot, send };
}
