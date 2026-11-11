import { AccessEnforcer } from './access-enforcer';
import { AccessRevalidator } from './access-revalidator';
import { ConnectionRegistry } from './connection-registry';
import { HeartbeatHandler } from './handlers/heartbeat-handler';
import { JoinHandler } from './handlers/join-handler';
import { LeaveHandler } from './handlers/leave-handler';
import { HeartbeatMonitor, type HeartbeatOptions } from './heartbeat-monitor';
import { MessageDispatcher } from './message-handler';
import { InMemoryPresenceRegistry } from './presence-registry';
import { CloseCode, HEARTBEAT_INTERVAL_MS } from './protocol';
import { RoomManager } from './room-manager';
import type { WorkspaceAccessChecker } from './workspace-access';

export type AppDependencies = {
  access: WorkspaceAccessChecker;
  heartbeat?: HeartbeatOptions;
  /** How often membership of joined rooms is checked again. */
  revalidateMs?: number;
  clock?: () => number;
};

/** The composition root: the only place the collaboration objects are wired together. */
export function createApp({
  access,
  heartbeat = { intervalMs: HEARTBEAT_INTERVAL_MS, maxMissed: 3 },
  revalidateMs = 30_000,
  clock = Date.now,
}: AppDependencies) {
  const presence = new InMemoryPresenceRegistry();
  const rooms = new RoomManager(presence);
  const connections = new ConnectionRegistry(rooms);
  const enforcer = new AccessEnforcer(rooms, connections);
  const dispatcher = new MessageDispatcher(
    [new JoinHandler(access, rooms, enforcer), new LeaveHandler(rooms), new HeartbeatHandler()],
    clock,
  );
  const monitor = new HeartbeatMonitor(connections, heartbeat, clock);
  const revalidator = new AccessRevalidator(access, connections, enforcer, revalidateMs);
  return {
    rooms,
    connections,
    enforcer,
    dispatcher,
    monitor,
    revalidator,
    clock,
    start() {
      monitor.start();
      revalidator.start();
    },
    /** Graceful shutdown: stop the timers and tell every client to go (they may reconnect). */
    stop() {
      monitor.stop();
      revalidator.stop();
      connections.closeAll(CloseCode.GoingAway, 'Server shutting down.');
    },
  };
}

export type App = ReturnType<typeof createApp>;
