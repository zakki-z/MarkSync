import type { AccessEnforcer } from './access-enforcer';
import type { ConnectionRegistry } from './connection-registry';
import type { DocumentAccess, DocumentAccessChecker } from './document-access';
import type { DocumentSessionManager } from './documents/document-session-manager';
import type { AccessDecision, WorkspaceAccessChecker } from './workspace-access';

/**
 * Re-asks the workspace service whether each connection may still be in each of its rooms, so a
 * member who is removed (or loses access) while connected is evicted within one interval. A sweep
 * asks once per token and workspace however many tabs share them, which is the cache that keeps
 * the load on the workspace service proportional to users rather than connections. An answer other
 * than "granted", including "unavailable", evicts: access is never assumed. Joined documents are
 * checked the same way; a connection whose edit permission was lost stays but stops being heard.
 */
export class AccessRevalidator {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly access: WorkspaceAccessChecker,
    private readonly documentAccess: DocumentAccessChecker,
    private readonly connections: ConnectionRegistry,
    private readonly enforcer: AccessEnforcer,
    private readonly documents: DocumentSessionManager,
    private readonly intervalMs: number,
  ) {}

  async sweep() {
    if (this.running) return;
    this.running = true;
    try {
      await Promise.all([this.sweepWorkspaces(), this.sweepDocuments()]);
    } finally {
      this.running = false;
    }
  }

  private async sweepWorkspaces() {
    const decide = once((token: string, workspaceId: number) =>
      this.access.check(token, workspaceId).catch((): AccessDecision => 'unavailable'),
    );
    await Promise.all(
      this.connections.all().flatMap((connection) =>
        [...connection.rooms].map(async (workspaceId) => {
          const decision = await decide(connection.token, workspaceId);
          // The connection may have gone or left the room while the answer was on its way.
          if (decision !== 'granted' && connection.rooms.has(workspaceId))
            this.enforcer.refuse(connection, workspaceId, decision);
        }),
      ),
    );
  }

  private async sweepDocuments() {
    const decide = once((token: string, documentId: number) =>
      this.documentAccess
        .check(token, documentId)
        .catch((): DocumentAccess => ({ status: 'unavailable' })),
    );
    await Promise.all(
      this.connections.all().flatMap((connection) =>
        [...connection.documents].map(async (documentId) => {
          const access = await decide(connection.token, documentId);
          if (!connection.documents.has(documentId)) return;
          if (access.status === 'granted')
            this.documents.setCanEdit(connection, documentId, access.canEdit);
          else this.enforcer.refuseDocument(connection, documentId, access.status);
        }),
      ),
    );
  }

  start() {
    this.timer ??= setInterval(() => void this.sweep(), this.intervalMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}

/** Memoizes by token and id for the length of one sweep, so shared tabs cost one call. */
function once<T>(ask: (token: string, id: number) => Promise<T>) {
  const answers = new Map<string, Promise<T>>();
  return (token: string, id: number) => {
    const key = `${id}:${token}`;
    const known = answers.get(key);
    if (known) return known;
    const asked = ask(token, id);
    answers.set(key, asked);
    return asked;
  };
}
