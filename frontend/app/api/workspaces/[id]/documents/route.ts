import {
  authenticate,
  forwardToDocuments,
  isPositiveId,
  readDraft,
} from '@/src/server/documentsProxy';

type Context = { params: Promise<{ id: string }> };

async function authorizeWorkspace(request: Request, context: Context) {
  const { id } = await context.params;
  if (!isPositiveId(id))
    return { error: Response.json({ detail: 'Invalid workspace ID' }, { status: 400 }) };
  const auth = await authenticate(request);
  if ('error' in auth) return { error: auth.error };
  return { path: `/api/workspaces/${id}/documents`, authorization: auth.authorization };
}

export async function GET(request: Request, context: Context) {
  const access = await authorizeWorkspace(request, context);
  if (access.error) return access.error;
  return forwardToDocuments('GET', access.path, access.authorization);
}

export async function POST(request: Request, context: Context) {
  const access = await authorizeWorkspace(request, context);
  if (access.error) return access.error;
  const payload = await readDraft(request);
  if ('error' in payload) return payload.error;
  return forwardToDocuments('POST', access.path, access.authorization, payload.draft);
}
