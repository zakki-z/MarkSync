import { forwardToWorkspaces } from '@/src/server/workspaceProxy';

type Context = { params: Promise<{ id: string; invitationId: string }> };

export async function DELETE(request: Request, context: Context) {
  const { id, invitationId } = await context.params;
  return forwardToWorkspaces(request, `/api/workspaces/${id}/invitations/${invitationId}`, [
    id,
    invitationId,
  ]);
}
