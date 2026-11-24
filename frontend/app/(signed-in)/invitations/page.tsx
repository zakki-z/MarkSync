'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSharedInvitations } from '@/src/components/InvitationsContext';
import { MyInvitationList } from '@/src/components/MyInvitationList';
import { ContentSkeleton, LoadError } from '@/src/components/PageStates';
import { acceptInvitation, declineInvitation, type Invitation } from '@/src/workspaceService';

function MyInvitations() {
  const router = useRouter();
  const { data: invitations, error, loading, setData, reload } = useSharedInvitations();
  const [busyId, setBusyId] = useState<number>();
  const [actionError, setActionError] = useState('');

  const respond = async (invitation: Invitation, accept: boolean) => {
    setBusyId(invitation.id);
    setActionError('');
    try {
      await (accept ? acceptInvitation : declineInvitation)(invitation.id);
      setData((invitations ?? []).filter((i) => i.id !== invitation.id));
      if (accept) router.push(`/w/${invitation.workspaceId}`);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Unable to answer the invitation.');
    }
    setBusyId(undefined);
  };

  if (loading) return <ContentSkeleton label="Loading invitations…" />;
  if (error) return <LoadError error={error} subject="invitations" onRetry={reload} />;
  return (
    <div className="editor-body">
      {actionError && (
        <div className="alert error" role="alert">
          {actionError}
        </div>
      )}
      {invitations && (
        <MyInvitationList
          invitations={invitations}
          busyId={busyId}
          onAccept={(invitation) => respond(invitation, true)}
          onDecline={(invitation) => respond(invitation, false)}
        />
      )}
    </div>
  );
}

export default function InvitationsPage() {
  return (
    <>
      <header className="workspace-topbar">
        <div className="workspace-location">
          <strong>My invitations</strong>
        </div>
      </header>
      <MyInvitations />
    </>
  );
}
