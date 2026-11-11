import { forbidden, mutationAllowed, sessionToken, unauthorized } from './session';
import { authBase, documentBase, fetchUpstream, relay, serviceUnavailable } from './upstream';

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

export type DocumentDraft = { title: string; markdown: string; visibility?: 'PRIVATE' | 'PUBLIC' };

export async function readDraft(
  request: Request,
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
    if (typeof raw.markdown !== 'string' || raw.markdown.length > 1_000_000) {
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
        markdown: raw.markdown,
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
