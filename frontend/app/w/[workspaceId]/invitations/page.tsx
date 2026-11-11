'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/src/components/AppShell';
import { InviteForm } from '@/src/components/InviteForm';
import { PendingInvitations } from '@/src/components/PendingInvitations';
import { WorkspaceTabs } from '@/src/components/WorkspaceTabs';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
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
  const router = useRouter();
  const workspaceId = Number(useParams<{ workspaceId: string }>().workspaceId);
  const { user, loading: userLoading } = useCurrentUser();
  const membership = useMembership(workspaceId);
  const canManage = membership.data?.canManageMembers ?? false;
  const invitations = useWorkspaceInvitations(workspaceId, canManage);
  const [actionError, setActionError] = useState('');

  if (userLoading || membership.loading)
    return (
      <main className="loading-screen" aria-live="polite">
        Loading invitations…
      </main>
    );
  if (!user || membership.error || !membership.data)
    return (
      <main className="loading-screen">
        <div className="loading-error">
          <h1>Unable to open invitations</h1>
          <p>{membership.error?.message ?? 'Please sign in to continue.'}</p>
          <button className="button subtle" onClick={() => router.replace('/documents')}>
            Back to your workspaces
          </button>
        </div>
      </main>
    );

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
    <AppShell user={user} activeWorkspaceId={workspaceId}>
      <header className="workspace-topbar">
        <div className="workspace-location">
          <WorkspaceTabs workspaceId={workspaceId} current="invitations" />
          <span className="readonly-badge">{membership.data.role.toLowerCase()}</span>
        </div>
      </header>
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
        {canManage && <PendingInvitations invitations={invitations.data ?? []} onRevoke={revoke} />}
      </div>
    </AppShell>
  );
}
