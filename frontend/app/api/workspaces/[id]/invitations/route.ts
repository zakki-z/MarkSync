import { forwardToWorkspaces } from '@/src/server/workspaceProxy';

type Context = { params: Promise<{ id: string }> };

async function forward(request: Request, context: Context) {
  const { id } = await context.params;
  return forwardToWorkspaces(request, `/api/workspaces/${id}/invitations`, [id]);
}

export const GET = forward;
export const POST = forward;
