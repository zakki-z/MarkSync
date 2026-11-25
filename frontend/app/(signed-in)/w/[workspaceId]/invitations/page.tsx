'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Lock, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { InlineAlert } from '@/src/components/common/ListRow';
import { ContentSkeleton, EmptyState, LoadError, PageBody } from '@/src/components/PageStates';
import { PendingInvitations, inviteeName } from '@/src/components/PendingInvitations';
import { Button } from '@/src/components/primitives/button';
import { useShell } from '@/src/components/shell/ShellContext';
import { WorkspaceHeader, WorkspaceTopBar } from '@/src/components/WorkspaceTabs';
import { useMembership } from '@/src/hooks/useMembership';
import { useWorkspaceInvitations } from '@/src/hooks/useWorkspaceInvitations';
import { revokeInvitation, type Invitation } from '@/src/workspaceService';

/** Invitations of one workspace. Owners invite and revoke; other roles are told they cannot. */
export default function WorkspaceInvitationsPage() {
  const shell = useShell();
  const workspaceId = Number(useParams<{ workspaceId: string }>().workspaceId);
  const membership = useMembership(workspaceId);
  const canManage = membership.data?.canManageMembers ?? false;
  const invitations = useWorkspaceInvitations(workspaceId, canManage);
  const [actionError, setActionError] = useState('');

  const revoke = async (invitation: Invitation) => {
    setActionError('');
    try {
      await revokeInvitation(workspaceId, invitation.id);
      invitations.setData((invitations.data ?? []).filter((i) => i.id !== invitation.id));
      toast.success(`Revoked the invitation for ${inviteeName(invitation)}`);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Unable to revoke the invitation.');
    }
  };

  const inviteButton = shell && (
    <Button size="sm" onClick={() => shell.openInvite(workspaceId)}>
      <UserPlus /> Invite people
    </Button>
  );

  return (
    <>
      <WorkspaceTopBar workspaceId={workspaceId} current="invitations" />
      <PageBody>
        {membership.error ? (
          <LoadError error={membership.error} subject="invitations" onRetry={membership.reload} />
        ) : (
          <>
            <WorkspaceHeader workspaceId={workspaceId} current="invitations" />
            {!membership.data ? (
              <ContentSkeleton label="Loading invitations…" />
            ) : !canManage ? (
              <div className="glass-flat rounded-panel">
                <EmptyState
                  icon={Lock}
                  title="Only workspace owners can invite people or manage invitations."
                  description="Ask an owner of this workspace to invite someone for you."
                />
              </div>
            ) : (
              <>
                {actionError && <InlineAlert>{actionError}</InlineAlert>}
                {invitations.error && <InlineAlert>{invitations.error.message}</InlineAlert>}
                {invitations.loading ? (
                  <ContentSkeleton label="Loading invitations…" />
                ) : (
                  <PendingInvitations
                    invitations={invitations.data ?? []}
                    onRevoke={revoke}
                    inviteAction={inviteButton}
                  />
                )}
              </>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}
