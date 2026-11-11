import { forwardToWorkspaces } from '@/src/server/workspaceProxy';

type Context = { params: Promise<{ id: string; userId: string }> };

async function forward(request: Request, context: Context) {
  const { id, userId } = await context.params;
  return forwardToWorkspaces(request, `/api/workspaces/${id}/members/${userId}`, [id, userId]);
}

export const PATCH = forward;
export const DELETE = forward;
