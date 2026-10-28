import { authBase, documentBase, fetchUpstream, relay, serviceUnavailable } from './upstream';

type AuthUser = { id: number; email: string; role: string };
type StoredDocument = { id: number; authorId: string; title: string; markdown: string };

type AuthResult = { user: AuthUser; authorization: string } | { error: Response };

export async function authenticate(request: Request): Promise<AuthResult> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return { error: Response.json({ detail: 'Please sign in.' }, { status: 401 }) };
  }
  try {
    const response = await fetchUpstream(`${authBase}/auth/me`, {
      headers: { Authorization: authorization },
    });
    if (response.status === 401 || response.status === 404) {
      return { error: Response.json({ detail: 'Your session expired. Please log in again.' }, { status: 401 }) };
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

export async function readDocument(id: string, authorization: string): Promise<Response> {
  try {
    return await fetchUpstream(`${documentBase}/api/documents/${encodeURIComponent(id)}`, {
      headers: { Authorization: authorization },
    });
  } catch {
    return serviceUnavailable('Document Service');
  }
}

export async function checkOwnership(
  id: string,
  user: AuthUser,
  authorization: string,
): Promise<{ document: StoredDocument } | { error: Response }> {
  try {
    const response = await readDocument(id, authorization);
    if (!response.ok) return { error: await relay(response) };
    const document = (await response.json()) as StoredDocument;
    // Defense in depth; the Document Service enforces ownership using the JWT subject.
    if (document.authorId !== String(user.id)) {
      return { error: Response.json({ detail: 'Document not found.' }, { status: 404 }) };
    }
    return { document };
  } catch {
    return { error: serviceUnavailable('Document Service') };
  }
}

export async function readDraft(request: Request): Promise<
  { draft: { title: string; markdown: string } } | { error: Response }
> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') throw new Error('Invalid body');
    const raw = body as Record<string, unknown>;
    if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.trim().length > 200) {
      return { error: Response.json({ detail: 'Title is required (maximum 200 characters).' }, { status: 400 }) };
    }
    if (typeof raw.markdown !== 'string' || raw.markdown.length > 1_000_000) {
      return { error: Response.json({ detail: 'Markdown content is required (maximum 1,000,000 characters).' }, { status: 400 }) };
    }
    return { draft: { title: raw.title.trim(), markdown: raw.markdown } };
  } catch {
    return { error: Response.json({ detail: 'Request body must be valid JSON.' }, { status: 400 }) };
  }
}

export async function writeDocument(
  path: string,
  method: 'POST' | 'PUT',
  authorization: string,
  draft: { title: string; markdown: string },
): Promise<Response> {
  try {
    const response = await fetchUpstream(`${documentBase}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: authorization },
      body: JSON.stringify(draft),
    });
    return relay(response);
  } catch {
    return serviceUnavailable('Document Service');
  }
}

export function isPositiveId(id: string): boolean {
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
}
