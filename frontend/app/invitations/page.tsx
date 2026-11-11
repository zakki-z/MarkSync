'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/src/components/AppShell';
import { useSharedInvitations } from '@/src/components/InvitationsContext';
import { MyInvitationList } from '@/src/components/MyInvitationList';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { acceptInvitation, declineInvitation, type Invitation } from '@/src/workspaceService';

function MyInvitations() {
  const router = useRouter();
  const { data: invitations, error, loading, setData } = useSharedInvitations();
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

  return (
    <div className="editor-body">
      {actionError && (
        <div className="alert error" role="alert">
          {actionError}
        </div>
      )}
      {loading && <p aria-live="polite">Loading invitations…</p>}
      {error && (
        <div className="alert error" role="alert">
          {error.message}
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
  const { user, loading } = useCurrentUser();
  if (loading)
    return (
      <main className="loading-screen" aria-live="polite">
        Loading…
      </main>
    );
  if (!user)
    return (
      <main className="loading-screen">
        <div className="loading-error">
          <h1>Unable to open invitations</h1>
          <p>Please sign in to continue.</p>
        </div>
      </main>
    );
  return (
    <AppShell user={user}>
      <header className="workspace-topbar">
        <div className="workspace-location">
          <strong>My invitations</strong>
        </div>
      </header>
      <MyInvitations />
    </AppShell>
  );
}
