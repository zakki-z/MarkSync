'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/src/components/AppShell';
import { MemberList } from '@/src/components/MemberList';
import { WorkspaceTabs } from '@/src/components/WorkspaceTabs';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useMembers } from '@/src/hooks/useMembers';
import { useMembership } from '@/src/hooks/useMembership';
import {
  changeMemberRole,
  leaveWorkspace,
  removeMember,
  type Member,
  type Role,
} from '@/src/workspaceService';

/** Members of one workspace. Owners manage roles; every other role sees a read-only list. */
export default function MembersPage() {
  const router = useRouter();
  const workspaceId = Number(useParams<{ workspaceId: string }>().workspaceId);
  const { user, loading: userLoading } = useCurrentUser();
  const membership = useMembership(workspaceId);
  const members = useMembers(workspaceId);
  const canManage = membership.data?.canManageMembers ?? false;
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
          <WorkspaceTabs workspaceId={workspaceId} current="members" />
          <span className="readonly-badge">{membership.data.role.toLowerCase()}</span>
        </div>
      </header>
      <div className="editor-body">
        {actionError && (
          <div className="alert error" role="alert">
            {actionError}
          </div>
        )}
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
