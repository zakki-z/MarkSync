import { authenticate, readDraft, writeDocument } from '@/src/server/documentsProxy';
import { documentBase, fetchUpstream, relay, serviceUnavailable } from '@/src/server/upstream';

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;

  try {
    const response = await fetchUpstream(`${documentBase}/api/documents`);
    if (!response.ok) return relay(response);
    const documents: unknown = await response.json();
    if (!Array.isArray(documents)) return serviceUnavailable('Document Service');
    // Temporary walking-skeleton isolation: backend should enforce this in a later phase.
    return Response.json(documents.filter((document) => document?.authorId === String(auth.user.id)));
  } catch {
    return serviceUnavailable('Document Service');
  }
}

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;
  const payload = await readDraft(request);
  if ('error' in payload) return payload.error;
  return writeDocument('/api/documents', 'POST', auth.user, payload.draft);
}
