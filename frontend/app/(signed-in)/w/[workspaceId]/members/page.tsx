'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useUser } from '@/src/auth/AuthProvider';
import { MemberList } from '@/src/components/MemberList';
import { ContentSkeleton, LoadError } from '@/src/components/PageStates';
import { WorkspaceTabs } from '@/src/components/WorkspaceTabs';
import { useMembers } from '@/src/hooks/useMembers';
import { useMembership } from '@/src/hooks/useMembership';
import { queryKeys } from '@/src/queries/keys';
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
  const queryClient = useQueryClient();
  const user = useUser();
  const workspaceId = Number(useParams<{ workspaceId: string }>().workspaceId);
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
      // Everything cached for this workspace, and the sidebar list, is now out of date.
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
      router.push('/documents');
    }, 'Unable to leave the workspace.');

  if (!user) return null;
  const error = membership.error ?? members.error;
  const retry = () => {
    if (membership.error) membership.reload();
    if (members.error) members.reload();
  };
  return (
    <>
      <header className="workspace-topbar">
        <div className="workspace-location">
          <WorkspaceTabs workspaceId={workspaceId} current="members" />
          {membership.data && (
            <span className="readonly-badge">{membership.data.role.toLowerCase()}</span>
          )}
        </div>
      </header>
      {error ? (
        <LoadError error={error} subject="members" onRetry={retry} />
      ) : !membership.data || !members.data ? (
        <ContentSkeleton label="Loading members…" />
      ) : (
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
      )}
    </>
  );
}
