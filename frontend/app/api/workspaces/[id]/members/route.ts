import { forwardToWorkspaces } from '@/src/server/workspaceProxy';

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return forwardToWorkspaces(request, `/api/workspaces/${id}/members`, [id]);
}
