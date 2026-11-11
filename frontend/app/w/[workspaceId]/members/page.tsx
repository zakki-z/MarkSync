'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/src/components/AppShell';
import { InviteForm } from '@/src/components/InviteForm';
import { MemberList } from '@/src/components/MemberList';
import { PendingInvitations } from '@/src/components/PendingInvitations';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useMembers } from '@/src/hooks/useMembers';
import { useMembership } from '@/src/hooks/useMembership';
import { useWorkspaceInvitations } from '@/src/hooks/useWorkspaceInvitations';
import {
  changeMemberRole,
  leaveWorkspace,
  removeMember,
  revokeInvitation,
  sendInvitation,
  type Invitation,
  type Member,
  type Role,
} from '@/src/workspaceService';

/** Members and invitations of one workspace. Owners manage; every other role sees a read-only list. */
export default function MembersPage() {
  const router = useRouter();
  const workspaceId = Number(useParams<{ workspaceId: string }>().workspaceId);
  const { user, loading: userLoading } = useCurrentUser();
  const membership = useMembership(workspaceId);
  const members = useMembers(workspaceId);
  const canManage = membership.data?.canManageMembers ?? false;
  const invitations = useWorkspaceInvitations(workspaceId, canManage);
  const [actionError, setActionError] = useState('');

  const run = async (action: () => Promise<void>, fallback: string) => {
    setActionError('');
    try {
      await action();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : fallback);
    }
  };

  if (userLoading || membership.loading || members.loading)
    return (
      <main className="loading-screen" aria-live="polite">
        Loading members…
      </main>
    );
  const error = membership.error ?? members.error;
  if (!user || error || !membership.data || !members.data)
    return (
      <main className="loading-screen">
        <div className="loading-error">
          <h1>Unable to open members</h1>
          <p>{error?.message ?? 'Please sign in to continue.'}</p>
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
  const revoke = (invitation: Invitation) =>
    run(async () => {
      await revokeInvitation(workspaceId, invitation.id);
      invitations.setData((invitations.data ?? []).filter((i) => i.id !== invitation.id));
    }, 'Unable to revoke the invitation.');
  const changeRole = (member: Member, role: Role) =>
    run(async () => {
      const updated = await changeMemberRole(workspaceId, member.userId, role);
      members.setData(members.data!.map((m) => (m.userId === member.userId ? updated : m)));
    }, 'Unable to change the role.');
  const remove = (member: Member) =>
    run(async () => {
      await removeMember(workspaceId, member.userId);
      members.setData(members.data!.filter((m) => m.userId !== member.userId));
    }, 'Unable to remove the member.');
  const leave = () =>
    run(async () => {
      await leaveWorkspace(workspaceId);
      router.push('/documents');
    }, 'Unable to leave the workspace.');

  return (
    <AppShell user={user} activeWorkspaceId={workspaceId}>
      <header className="workspace-topbar">
        <div className="workspace-location">
          <strong>Members</strong>
          <span className="readonly-badge">{membership.data.role.toLowerCase()}</span>
        </div>
      </header>
      <div className="editor-body">
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
        <MemberList
          members={members.data}
          currentUserId={String(user.id)}
          canManage={canManage}
          onChangeRole={changeRole}
          onRemove={remove}
          onLeave={leave}
        />
      </div>
    </AppShell>
  );
}
