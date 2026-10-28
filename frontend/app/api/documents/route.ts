import { authenticate, readDraft, writeDocument } from '@/src/server/documentsProxy';
import { documentBase, fetchUpstream, relay, serviceUnavailable } from '@/src/server/upstream';

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;

  try {
    const response = await fetchUpstream(`${documentBase}/api/documents`, {
      headers: { Authorization: auth.authorization },
    });
    if (!response.ok) return relay(response);
    const documents: unknown = await response.json();
    if (!Array.isArray(documents)) return serviceUnavailable('Document Service');
    // Defense in depth; the backend also scopes this list to the JWT subject.
    return Response.json(
      documents.filter((document) => document?.authorId === String(auth.user.id)),
    );
  } catch {
    return serviceUnavailable('Document Service');
  }
}

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;
  const payload = await readDraft(request);
  if ('error' in payload) return payload.error;
  return writeDocument('/api/documents', 'POST', auth.authorization, payload.draft);
}
