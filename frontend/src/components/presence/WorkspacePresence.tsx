'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { useMembership } from '@/src/hooks/useMembership';
import { PresenceHub } from '@/src/presence/PresenceHub';

const HubContext = createContext<PresenceHub | null>(null);

const noSubscription = () => () => undefined;
const nothing = () => undefined;

/** Opens the connection once the API confirms membership: visitors of public documents get none. */
function MemberConnection({
  hub,
  workspaceId,
  onSessionExpired,
}: {
  hub: PresenceHub;
  workspaceId: number;
  onSessionExpired: () => void;
}) {
  const { data: membership } = useMembership(workspaceId);
  const member = membership !== undefined;
  const expired = useRef(onSessionExpired);
  useEffect(() => {
    expired.current = onSessionExpired;
  });

  useEffect(() => {
    if (!member) return;
    return hub.connect({
      workspaceId,
      createSocket: () =>
        new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`),
      onSessionExpired: () => expired.current(),
    });
  }, [hub, workspaceId, member]);
  return null;
}

/**
 * Owns the presence connection of the workspace that is open, for as long as it stays open: moving
 * between its documents and sections keeps the same connection. The context value never changes,
 * so this provider never re-renders the pages inside it.
 */
export function WorkspacePresenceProvider({
  workspaceId,
  onSessionExpired,
  children,
}: {
  workspaceId?: number;
  onSessionExpired: () => void;
  children: ReactNode;
}) {
  const [hub] = useState(() => new PresenceHub());
  return (
    <HubContext.Provider value={hub}>
      {workspaceId !== undefined && (
        <MemberConnection
          key={workspaceId}
          hub={hub}
          workspaceId={workspaceId}
          onSessionExpired={onSessionExpired}
        />
      )}
      {children}
    </HubContext.Provider>
  );
}

function useSlice<T>(read: (hub: PresenceHub) => () => T | undefined): T | undefined {
  const hub = useContext(HubContext);
  return useSyncExternalStore(
    hub ? hub.subscribe : noSubscription,
    hub ? read(hub) : nothing,
    nothing,
  );
}

/** Connection state, or undefined when there is no presence connection. */
export const usePresenceStatus = () => useSlice((hub) => hub.getStatus);
/** Who is online, or undefined when there is no presence connection. */
export const useOnlineUsers = () => useSlice((hub) => hub.getUsers);
/** Messages received since the connection opened. */
export const usePresenceMessages = () => useSlice((hub) => hub.getMessages);

/** Sends a message to everyone online; false when the connection is not ready. */
export function useSendMessage(): (text: string) => boolean {
  const hub = useContext(HubContext);
  return hub ? hub.send : () => false;
}
