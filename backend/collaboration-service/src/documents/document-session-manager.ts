import * as Y from 'yjs';
import type { Connection } from '../connection';
import type { DocumentPersistence } from '../persistence/document-persistence';
import { loadDocument } from './document-loader';
import { DocumentSession, type ErrorReporter, type PersistenceOptions } from './document-session';
import { markdownOf } from './yjs-content';

/** What the Document service said about the document when the connection asked to join. */
export type DocumentGrant = { canEdit: boolean; markdown: string };

/**
 * Holds the open sessions. A session is loaded when its first connection joins, kept while anyone
 * is in it and evicted once the last connection has left and its buffered updates are stored. If
 * that final write fails the session stays, empty, and is evicted when a retry succeeds.
 */
export class DocumentSessionManager {
  private readonly sessions = new Map<number, DocumentSession>();
  private readonly loading = new Map<number, Promise<DocumentSession>>();

  constructor(
    private readonly persistence: DocumentPersistence,
    private readonly options: PersistenceOptions,
    private readonly report: ErrorReporter,
  ) {}

  get(documentId: number): DocumentSession | undefined {
    return this.sessions.get(documentId);
  }

  /** The connection must already be authorized. Returns undefined if it closed while loading. */
  async join(connection: Connection, documentId: number, grant: DocumentGrant) {
    const session = this.sessions.get(documentId) ?? (await this.load(documentId, grant.markdown));
    if (!connection.isOpen) {
      void this.evictWhenIdle(session);
      return undefined;
    }
    session.addMember(connection, grant.canEdit);
    connection.documents.add(documentId);
    return session;
  }

  /** Resolves once the session was evicted, or failed to store its last updates (it stays open). */
  async leave(connection: Connection, documentId: number) {
    if (!connection.documents.delete(documentId)) return;
    const session = this.sessions.get(documentId);
    session?.removeMember(connection);
    if (session) await this.evictWhenIdle(session);
  }

  async leaveAll(connection: Connection) {
    await Promise.all([...connection.documents].map((id) => this.leave(connection, id)));
  }

  /** The current Markdown: the open session's, else the stored state's, else the given seed. */
  async markdownOf(documentId: number, seedMarkdown: string): Promise<string> {
    const open = this.sessions.get(documentId);
    if (open) return markdownOf(open.doc);
    // A read never seeds: a document nobody has opened still has its Markdown in the Document service.
    const stored = await this.persistence.load(documentId);
    if (!stored) return seedMarkdown;
    const doc = new Y.Doc();
    Y.applyUpdate(doc, stored.update);
    const markdown = markdownOf(doc);
    doc.destroy();
    return markdown;
  }

  /** Stores everything still buffered and releases every session. Failures are reported. */
  async shutdown() {
    const sessions = [...this.sessions.values()];
    await Promise.allSettled(sessions.map((session) => session.flush()));
    for (const session of sessions) this.evict(session);
  }

  private load(documentId: number, seedMarkdown: string): Promise<DocumentSession> {
    const known = this.loading.get(documentId);
    if (known) return known;
    const loaded = this.create(documentId, seedMarkdown).finally(() =>
      this.loading.delete(documentId),
    );
    this.loading.set(documentId, loaded);
    return loaded;
  }

  private async create(documentId: number, seedMarkdown: string) {
    const { doc, pendingUpdates } = await loadDocument(this.persistence, documentId, seedMarkdown);
    const session = new DocumentSession(documentId, doc, pendingUpdates, {
      persistence: this.persistence,
      options: this.options,
      report: this.report,
      onFlushed: (flushed) => {
        if (!flushed.hasMembers) this.evict(flushed);
      },
    });
    this.sessions.set(documentId, session);
    return session;
  }

  private async evictWhenIdle(session: DocumentSession) {
    if (session.hasMembers) return;
    // A successful flush reports back through `onFlushed`, which evicts an idle session.
    await session.flush().catch(() => {});
  }

  private evict(session: DocumentSession) {
    if (this.sessions.get(session.documentId) !== session) return;
    this.sessions.delete(session.documentId);
    session.destroy();
  }
}
