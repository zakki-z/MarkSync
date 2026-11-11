import {
  authenticate,
  forwardToDocuments,
  isPositiveId,
  optionalAuthorization,
  readDraft,
} from '@/src/server/documentsProxy';

type Context = { params: Promise<{ id: string }> };

async function documentPath(context: Context) {
  const { id } = await context.params;
  return isPositiveId(id) ? `/api/documents/${id}` : undefined;
}

const invalidId = () => Response.json({ detail: 'Invalid document ID' }, { status: 400 });

/** Public documents are readable without a session; the Document Service decides per document. */
export async function GET(request: Request, context: Context) {
  const path = await documentPath(context);
  if (!path) return invalidId();
  const auth = await optionalAuthorization(request);
  if (auth.error) return auth.error;
  return forwardToDocuments('GET', path, auth.authorization);
}

export async function PUT(request: Request, context: Context) {
  const path = await documentPath(context);
  if (!path) return invalidId();
  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;
  const payload = await readDraft(request);
  if ('error' in payload) return payload.error;
  return forwardToDocuments('PUT', path, auth.authorization, payload.draft);
}

export async function DELETE(request: Request, context: Context) {
  const path = await documentPath(context);
  if (!path) return invalidId();
  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;
  return forwardToDocuments('DELETE', path, auth.authorization);
}
