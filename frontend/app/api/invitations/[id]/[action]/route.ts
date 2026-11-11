import { forwardToWorkspaces } from '@/src/server/workspaceProxy';

type Context = { params: Promise<{ id: string; action: string }> };

export async function POST(request: Request, context: Context) {
  const { id, action } = await context.params;
  if (action !== 'accept' && action !== 'decline') return new Response(null, { status: 404 });
  return forwardToWorkspaces(request, `/api/invitations/${id}/${action}`, [id]);
}
