import type { DocumentAccessChecker } from '../document-access';
import type { AccessDecision } from '../workspace-access';
import type { DocumentSessionManager } from './document-session-manager';

export type MarkdownResult =
  { status: 'granted'; markdown: string } | { status: Exclude<AccessDecision, 'granted'> };

/**
 * The derived plain-text view of a document, for REST clients that do not speak Yjs (the public
 * read-only page). Read-only by construction: the text comes from the open session or the stored
 * Yjs state, and the same access check as for joining decides who may read it.
 */
export class DocumentMarkdownReader {
  constructor(
    private readonly access: DocumentAccessChecker,
    private readonly documents: DocumentSessionManager,
  ) {}

  async read(token: string | undefined, documentId: number): Promise<MarkdownResult> {
    const access = await this.access.check(token, documentId);
    if (access.status !== 'granted') return { status: access.status };
    return {
      status: 'granted',
      markdown: await this.documents.markdownOf(documentId, access.markdown),
    };
  }
}
