import { AccessEnforcer } from './access-enforcer';
import { AccessRevalidator } from './access-revalidator';
import { ConnectionRegistry } from './connection-registry';
import type { DocumentAccessChecker } from './document-access';
import type { ErrorReporter, PersistenceOptions } from './documents/document-session';
import { DocumentMarkdownReader } from './documents/document-markdown-reader';
import { DocumentSessionManager } from './documents/document-session-manager';
import { ChatHandler } from './handlers/chat-handler';
import { DocumentAwarenessHandler } from './handlers/document-awareness-handler';
import { DocumentJoinHandler } from './handlers/document-join-handler';
import { DocumentLeaveHandler } from './handlers/document-leave-handler';
import { DocumentSyncHandler } from './handlers/document-sync-handler';
import { HeartbeatHandler } from './handlers/heartbeat-handler';
import { JoinHandler } from './handlers/join-handler';
import { LeaveHandler } from './handlers/leave-handler';
import { HeartbeatMonitor, type HeartbeatOptions } from './heartbeat-monitor';
import { MessageDispatcher } from './message-handler';
import type { DocumentPersistence } from './persistence/document-persistence';
import { InMemoryPresenceRegistry } from './presence-registry';
import { CloseCode, HEARTBEAT_INTERVAL_MS } from './protocol';
import { RoomManager } from './room-manager';
import type { WorkspaceAccessChecker } from './workspace-access';

const DEFAULT_PERSISTENCE: PersistenceOptions = {
  debounceMs: 1000,
  maxWaitMs: 5000,
  retryMs: 2000,
  compactAfter: 100,
};

export type AppDependencies = {
  access: WorkspaceAccessChecker;
  documentAccess: DocumentAccessChecker;
  persistence: DocumentPersistence;
  persistenceOptions?: PersistenceOptions;
  /** Told about storage failures; they are retried, so this is for logging. */
  reportError?: ErrorReporter;
  heartbeat?: HeartbeatOptions;
  /** How often membership of joined rooms is checked again. */
  revalidateMs?: number;
  clock?: () => number;
};

/** The composition root: the only place the collaboration objects are wired together. */
export function createApp({
  access,
  documentAccess,
  persistence,
  persistenceOptions = DEFAULT_PERSISTENCE,
  reportError = (documentId, error) =>
    console.error(`Storing document ${documentId} failed; it will be retried.`, error),
  heartbeat = { intervalMs: HEARTBEAT_INTERVAL_MS, maxMissed: 3 },
  revalidateMs = 30_000,
  clock = Date.now,
}: AppDependencies) {
  const presence = new InMemoryPresenceRegistry();
  const rooms = new RoomManager(presence);
  const documents = new DocumentSessionManager(persistence, persistenceOptions, reportError);
  const connections = new ConnectionRegistry(rooms, documents);
  const enforcer = new AccessEnforcer(rooms, connections, documents);
  const dispatcher = new MessageDispatcher(
    [
      new JoinHandler(access, rooms, enforcer),
      new LeaveHandler(rooms),
      new HeartbeatHandler(),
      new ChatHandler(rooms, clock),
      new DocumentJoinHandler(documentAccess, documents, enforcer),
      new DocumentLeaveHandler(documents),
      new DocumentSyncHandler(documents),
      new DocumentAwarenessHandler(documents),
    ],
    clock,
  );
  const monitor = new HeartbeatMonitor(connections, heartbeat, clock);
  const revalidator = new AccessRevalidator(
    access,
    documentAccess,
    connections,
    enforcer,
    documents,
    revalidateMs,
  );
  return {
    rooms,
    documents,
    markdown: new DocumentMarkdownReader(documentAccess, documents),
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
    /**
     * Graceful shutdown: stop the timers, tell every client to go (they may reconnect) and store
     * every edit still buffered. The returned promise settles when storing is done.
     */
    stop() {
      monitor.stop();
      revalidator.stop();
      connections.closeAll(CloseCode.ServiceRestart, 'Server shutting down.');
      return documents.shutdown();
    },
  };
}

export type App = ReturnType<typeof createApp>;
