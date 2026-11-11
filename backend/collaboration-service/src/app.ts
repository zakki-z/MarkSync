import { AccessEnforcer } from './access-enforcer';
import { ConnectionRegistry } from './connection-registry';
import { JoinHandler } from './handlers/join-handler';
import { LeaveHandler } from './handlers/leave-handler';
import { MessageDispatcher } from './message-handler';
import { InMemoryPresenceRegistry } from './presence-registry';
import { RoomManager } from './room-manager';
import type { WorkspaceAccessChecker } from './workspace-access';

export type AppDependencies = {
  access: WorkspaceAccessChecker;
};

/** The composition root: the only place the collaboration objects are wired together. */
export function createApp({ access }: AppDependencies) {
  const presence = new InMemoryPresenceRegistry();
  const rooms = new RoomManager(presence);
  const connections = new ConnectionRegistry(rooms);
  const enforcer = new AccessEnforcer(rooms, connections);
  const dispatcher = new MessageDispatcher([
    new JoinHandler(access, rooms, enforcer),
    new LeaveHandler(rooms),
  ]);
  return { rooms, connections, enforcer, dispatcher };
}

export type App = ReturnType<typeof createApp>;
