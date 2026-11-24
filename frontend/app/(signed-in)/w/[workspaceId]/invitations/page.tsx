'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { InviteForm } from '@/src/components/InviteForm';
import { ContentSkeleton, LoadError } from '@/src/components/PageStates';
import { PendingInvitations } from '@/src/components/PendingInvitations';
import { WorkspaceTabs } from '@/src/components/WorkspaceTabs';
import { useMembership } from '@/src/hooks/useMembership';
import { useWorkspaceInvitations } from '@/src/hooks/useWorkspaceInvitations';
import {
  revokeInvitation,
  sendInvitation,
  type Invitation,
  type Role,
} from '@/src/workspaceService';

/** Invitations of one workspace. Owners invite and revoke; other roles are told they cannot. */
export default function WorkspaceInvitationsPage() {
  const workspaceId = Number(useParams<{ workspaceId: string }>().workspaceId);
  const membership = useMembership(workspaceId);
  const canManage = membership.data?.canManageMembers ?? false;
  const invitations = useWorkspaceInvitations(workspaceId, canManage);
  const [actionError, setActionError] = useState('');

  const invite = async (identifier: string, role: Role) => {
    const sent = await sendInvitation(workspaceId, identifier, role);
    invitations.setData([sent, ...(invitations.data ?? [])]);
  };
  const revoke = async (invitation: Invitation) => {
    setActionError('');
    try {
      await revokeInvitation(workspaceId, invitation.id);
      invitations.setData((invitations.data ?? []).filter((i) => i.id !== invitation.id));
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Unable to revoke the invitation.');
    }
  };

  return (
    <>
      <header className="workspace-topbar">
        <div className="workspace-location">
          <WorkspaceTabs workspaceId={workspaceId} current="invitations" />
          {membership.data && (
            <span className="readonly-badge">{membership.data.role.toLowerCase()}</span>
          )}
        </div>
      </header>
      {membership.error ? (
        <LoadError error={membership.error} subject="invitations" onRetry={membership.reload} />
      ) : !membership.data ? (
        <ContentSkeleton label="Loading invitations…" />
      ) : (
        <div className="editor-body">
          {!canManage && (
            <p className="empty">Only workspace owners can invite people or manage invitations.</p>
          )}
          {actionError && (
            <div className="alert error" role="alert">
              {actionError}
            </div>
          )}
          {canManage && <InviteForm onInvite={invite} />}
          {canManage && invitations.error && (
            <div className="alert error" role="alert">
              {invitations.error.message}
            </div>
          )}
          {canManage && (
            <PendingInvitations invitations={invitations.data ?? []} onRevoke={revoke} />
          )}
        </div>
      )}
    </>
  );
}
