import {
  authenticate, checkOwnership, isPositiveId, readDraft, writeDocument,
} from '@/src/server/documentsProxy';
import { documentBase, fetchUpstream, relay, serviceUnavailable } from '@/src/server/upstream';

type Context = { params: Promise<{ id: string }> };

async function authorizeDocument(request: Request, context: Context) {
  const { id } = await context.params;
  if (!isPositiveId(id)) return { error: Response.json({ detail: 'Invalid document ID' }, { status: 400 }) };
  const auth = await authenticate(request);
  if ('error' in auth) return { error: auth.error };
  const owned = await checkOwnership(id, auth.user, auth.authorization);
  if ('error' in owned) return { error: owned.error };
  return { id, authorization: auth.authorization, document: owned.document };
}

export async function GET(request: Request, context: Context) {
  const access = await authorizeDocument(request, context);
  if ('error' in access) return access.error;
  return Response.json(access.document);
}

export async function PUT(request: Request, context: Context) {
  const access = await authorizeDocument(request, context);
  if ('error' in access) return access.error;
  const payload = await readDraft(request);
  if ('error' in payload) return payload.error;
  return writeDocument(`/api/documents/${access.id}`, 'PUT', access.authorization, payload.draft);
}

export async function DELETE(request: Request, context: Context) {
  const access = await authorizeDocument(request, context);
  if ('error' in access) return access.error;
  try {
    return relay(await fetchUpstream(`${documentBase}/api/documents/${access.id}`, {
      method: 'DELETE', headers: { Authorization: access.authorization },
    }));
  } catch {
    return serviceUnavailable('Document Service');
  }
}
