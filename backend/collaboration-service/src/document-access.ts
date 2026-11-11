import type { FetchFn } from './http';
import type { AccessDecision } from './workspace-access';

export type DocumentAccess =
  | {
      status: 'granted';
      canEdit: boolean;
      /** The Markdown the Document service holds: the seed for a document nobody has opened yet. */
      markdown: string;
    }
  | { status: Exclude<AccessDecision, 'granted'> };

/**
 * Asks whether a user may read (and edit) a document. The rules live in the Document service's
 * `DocumentAccessPolicy`; this service never re-implements them. A missing token means an
 * anonymous visitor, who can only read public documents. Never rejects: anything that is not a
 * clear answer is a refusal (fail closed).
 */
export interface DocumentAccessChecker {
  check(token: string | undefined, documentId: number): Promise<DocumentAccess>;
}

/** `GET /api/documents/{id}` applies the policy for the caller and reports `canEdit`. */
export class HttpDocumentAccessChecker implements DocumentAccessChecker {
  constructor(
    private readonly documentUrl: string,
    private readonly timeoutMs = 5000,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async check(token: string | undefined, documentId: number): Promise<DocumentAccess> {
    try {
      const response = await this.fetchFn(`${this.documentUrl}/api/documents/${documentId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (response.status === 401) return { status: 'unauthenticated' };
      if (response.status === 403 || response.status === 404) return { status: 'denied' };
      if (!response.ok) return { status: 'unavailable' };
      const body = (await response.json()) as { canEdit?: unknown; markdown?: unknown };
      if (typeof body.canEdit !== 'boolean' || typeof body.markdown !== 'string')
        return { status: 'unavailable' };
      return { status: 'granted', canEdit: body.canEdit, markdown: body.markdown };
    } catch {
      return { status: 'unavailable' };
    }
  }
}
