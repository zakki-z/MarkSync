'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { InlineAlert } from '@/src/components/common/ListRow';
import { useSharedInvitations } from '@/src/components/InvitationsContext';
import { MyInvitationList } from '@/src/components/MyInvitationList';
import { ContentSkeleton, LoadError, PageBody } from '@/src/components/PageStates';
import { Breadcrumb, TopBar } from '@/src/components/shell/TopBar';
import { queryKeys } from '@/src/queries/keys';
import { acceptInvitation, declineInvitation, type Invitation } from '@/src/workspaceService';

function MyInvitations() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: invitations, error, loading, setData, reload } = useSharedInvitations();
  const [busyId, setBusyId] = useState<number>();
  const [actionError, setActionError] = useState('');

  const respond = async (invitation: Invitation, accept: boolean) => {
    setBusyId(invitation.id);
    setActionError('');
    try {
      await (accept ? acceptInvitation : declineInvitation)(invitation.id);
      setData((invitations ?? []).filter((i) => i.id !== invitation.id));
      if (accept) {
        toast.success(`Joined ${invitation.workspaceName}`);
        // Joining adds a workspace to the sidebar.
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces, exact: true });
        router.push(`/w/${invitation.workspaceId}`);
      } else {
        toast(`Declined the invitation to ${invitation.workspaceName}`);
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Unable to answer the invitation.');
    }
    setBusyId(undefined);
  };

  if (loading) return <ContentSkeleton label="Loading invitations…" />;
  if (error) return <LoadError error={error} subject="invitations" onRetry={reload} />;
  return (
    <>
      {actionError && <InlineAlert>{actionError}</InlineAlert>}
      {invitations && (
        <MyInvitationList
          invitations={invitations}
          busyId={busyId}
          onAccept={(invitation) => respond(invitation, true)}
          onDecline={(invitation) => respond(invitation, false)}
        />
      )}
    </>
  );
}

export default function InvitationsPage() {
  return (
    <>
      <TopBar breadcrumb={<Breadcrumb items={[{ label: 'My invitations' }]} />} />
      <PageBody>
        <div className="mb-5">
          <h1 className="text-[28px] leading-10 font-bold tracking-[-0.03em] text-foreground sm:text-[34px]">
            My invitations
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Workspaces you have been invited to join.
          </p>
        </div>
        <MyInvitations />
      </PageBody>
    </>
  );
}
