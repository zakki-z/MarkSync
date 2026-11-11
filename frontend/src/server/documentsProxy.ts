import { forbidden, mutationAllowed, sessionToken, unauthorized } from './session';
import {
  authBase,
  collaborationBase,
  documentBase,
  fetchUpstream,
  relay,
  serviceUnavailable,
} from './upstream';

type AuthUser = { id: number; email: string; role: string };

type AuthResult = { user: AuthUser; authorization: string } | { error: Response };

export async function authenticate(request: Request): Promise<AuthResult> {
  if (!mutationAllowed(request)) return { error: forbidden() };
  const token = sessionToken(request);
  if (!token) return { error: unauthorized() };
  const authorization = `Bearer ${token}`;
  try {
    const response = await fetchUpstream(`${authBase}/auth/me`, {
      headers: { Authorization: authorization },
    });
    if (response.status === 401 || response.status === 404) {
      return { error: unauthorized() };
    }
    if (!response.ok) return { error: serviceUnavailable('Auth Service') };
    const user = (await response.json()) as AuthUser;
    if (!Number.isInteger(user.id)) {
      return { error: Response.json({ detail: 'Invalid user identity.' }, { status: 401 }) };
    }
    return { user, authorization };
  } catch {
    return { error: serviceUnavailable('Auth Service') };
  }
}

/**
 * Public reads accept anonymous visitors. A missing or expired session reads as anonymous, so a
 * stale cookie does not hide a public document.
 */
export async function optionalAuthorization(
  request: Request,
): Promise<
  { authorization?: string; error?: undefined } | { authorization?: undefined; error: Response }
> {
  if (!sessionToken(request)) return {};
  const auth = await authenticate(request);
  if ('error' in auth) return auth.error.status === 401 ? {} : { error: auth.error };
  return { authorization: auth.authorization };
}

/** `markdown` is the initial content of a new document; updates carry only title and visibility. */
export type DocumentDraft = {
  title: string;
  markdown?: string;
  visibility?: 'PRIVATE' | 'PUBLIC';
};

export async function readDraft(
  request: Request,
  { markdownRequired }: { markdownRequired: boolean },
): Promise<{ draft: DocumentDraft } | { error: Response }> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') throw new Error('Invalid body');
    const raw = body as Record<string, unknown>;
    if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.trim().length > 200) {
      return {
        error: Response.json(
          { detail: 'Title is required (maximum 200 characters).' },
          { status: 400 },
        ),
      };
    }
    const markdownValid =
      typeof raw.markdown === 'string'
        ? raw.markdown.length <= 1_000_000
        : raw.markdown === undefined && !markdownRequired;
    if (!markdownValid) {
      return {
        error: Response.json(
          { detail: 'Markdown content is required (maximum 1,000,000 characters).' },
          { status: 400 },
        ),
      };
    }
    if (
      raw.visibility !== undefined &&
      raw.visibility !== 'PRIVATE' &&
      raw.visibility !== 'PUBLIC'
    ) {
      return {
        error: Response.json({ detail: 'Visibility must be PRIVATE or PUBLIC.' }, { status: 400 }),
      };
    }
    return {
      draft: {
        title: raw.title.trim(),
        // An update never carries Markdown: live content belongs to the collaboration service.
        ...(markdownRequired && { markdown: raw.markdown as string }),
        ...(raw.visibility && { visibility: raw.visibility }),
      },
    };
  } catch {
    return {
      error: Response.json({ detail: 'Request body must be valid JSON.' }, { status: 400 }),
    };
  }
}

/** Relays a call to the Document Service, which enforces access with the caller's JWT. */
export async function forwardToDocuments(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  authorization?: string,
  draft?: DocumentDraft,
): Promise<Response> {
  try {
    return await relay(
      await fetchUpstream(`${documentBase}${path}`, {
        method,
        headers: {
          ...(authorization && { Authorization: authorization }),
          ...(draft && { 'Content-Type': 'application/json' }),
        },
        ...(draft && { body: JSON.stringify(draft) }),
      }),
    );
  } catch {
    return serviceUnavailable('Document Service');
  }
}

export function isPositiveId(id: string): boolean {
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
}

/**
 * Reads a document and replaces its stored Markdown, which is only the seed copy, with the live
 * text from the collaboration service. Both services check the caller's token, so a document is
 * only returned to someone allowed to read it. If the live text cannot be fetched the read fails
 * rather than showing stale content as current.
 */
export async function readDocument(path: string, authorization?: string): Promise<Response> {
  const headers = authorization ? { Authorization: authorization } : undefined;
  try {
    const stored = await fetchUpstream(`${documentBase}${path}`, { headers });
    if (!stored.ok) return relay(stored);
    const live = await fetchUpstream(`${collaborationBase}${path.replace('/api', '')}/markdown`, {
      headers,
    });
    if (!live.ok) return serviceUnavailable('Collaboration Service');
    const document = (await stored.json()) as Record<string, unknown>;
    return Response.json(
      { ...document, markdown: await live.text() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return serviceUnavailable('Collaboration Service');
  }
}
