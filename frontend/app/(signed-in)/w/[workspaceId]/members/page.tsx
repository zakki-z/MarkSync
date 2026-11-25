'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useUser } from '@/src/auth/AuthProvider';
import { InlineAlert, RoleBadge } from '@/src/components/common/ListRow';
import { MemberList, memberName } from '@/src/components/MemberList';
import { ContentSkeleton, LoadError, PageBody } from '@/src/components/PageStates';
import { roleLabel } from '@/src/components/roleLabel';
import { WorkspaceHeader, WorkspaceTopBar } from '@/src/components/WorkspaceTabs';
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

  const run = async (action: () => Promise<void>, fallback: string, success?: string) => {
    setActionError('');
    try {
      await action();
      if (success) toast.success(success);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : fallback);
    }
  };

  const changeRole = (member: Member, role: Role) =>
    run(
      async () => {
        const updated = await changeMemberRole(workspaceId, member.userId, role);
        members.setData(members.data!.map((m) => (m.userId === member.userId ? updated : m)));
      },
      'Unable to change the role.',
      `${memberName(member)} is now ${roleLabel(role)}`,
    );
  const remove = (member: Member) =>
    run(
      async () => {
        await removeMember(workspaceId, member.userId);
        members.setData(members.data!.filter((m) => m.userId !== member.userId));
      },
      'Unable to remove the member.',
      `Removed ${memberName(member)}`,
    );
  const leave = () =>
    run(
      async () => {
        await leaveWorkspace(workspaceId);
        // Everything cached for this workspace, and the sidebar list, is now out of date.
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces });
        router.push('/documents');
      },
      'Unable to leave the workspace.',
      'You left the workspace',
    );

  if (!user) return null;
  const error = membership.error ?? members.error;
  const retry = () => {
    if (membership.error) membership.reload();
    if (members.error) members.reload();
  };
  return (
    <>
      <WorkspaceTopBar workspaceId={workspaceId} current="members" />
      <PageBody>
        {error ? (
          <LoadError error={error} subject="members" onRetry={retry} />
        ) : (
          <>
            <WorkspaceHeader
              workspaceId={workspaceId}
              current="members"
              aside={
                membership.data && (
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    Your role <RoleBadge role={membership.data.role} />
                  </span>
                )
              }
            />
            {!membership.data || !members.data ? (
              <ContentSkeleton label="Loading members…" />
            ) : (
              <>
                {actionError && <InlineAlert>{actionError}</InlineAlert>}
                <MemberList
                  members={members.data}
                  currentUserId={String(user.id)}
                  canManage={canManage}
                  onChangeRole={changeRole}
                  onRemove={remove}
                  onLeave={leave}
                />
              </>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}
