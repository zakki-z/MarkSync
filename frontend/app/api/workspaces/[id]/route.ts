import { isPositiveId } from '@/src/server/documentsProxy';
import { forwardToWorkspaces } from '@/src/server/workspaceProxy';

type Context = { params: Promise<{ id: string }> };

async function forward(request: Request, context: Context) {
  const { id } = await context.params;
  if (!isPositiveId(id)) {
    return Response.json({ detail: 'Invalid workspace ID' }, { status: 400 });
  }
  return forwardToWorkspaces(request, `/api/workspaces/${id}`);
}

export const GET = forward;
export const PATCH = forward;
export const DELETE = forward;
