'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ApiError } from '@/src/apiClient';
import { AppShell } from '@/src/components/AppShell';
import { PageSkeleton } from '@/src/components/PageSkeleton';
import { WorkspaceTabs } from '@/src/components/WorkspaceTabs';
import { DocumentList } from '@/src/components/DocumentList';
import { WorkspacePresencePanel } from '@/src/components/WorkspacePresencePanel';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useEndSession } from '@/src/hooks/useEndSession';
import { useWorkspaceDocuments } from '@/src/hooks/useWorkspaceDocuments';
import { useCreateDocument } from '@/src/queries/mutations';

export default function WorkspaceDashboard() {
  const router = useRouter();
  const endSession = useEndSession();
  const expireSession = useCallback(() => void endSession(), [endSession]);
  const workspaceId = Number(useParams<{ workspaceId: string }>().workspaceId);
  const { user, loading: userLoading } = useCurrentUser();
  const { data: documents, error, loading } = useWorkspaceDocuments(workspaceId);
  const createDocument = useCreateDocument().mutateAsync;
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const sessionExpired = error instanceof ApiError && error.status === 401;
  useEffect(() => {
    if (sessionExpired) void endSession();
  }, [sessionExpired, endSession]);

  const newDocument = async () => {
    setCreating(true);
    setCreateError('');
    try {
      const created = await createDocument({
        workspaceId,
        draft: { title: 'Untitled document', markdown: '' },
      });
      router.push(`/w/${workspaceId}/d/${created.id}`);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Unable to create document.');
      setCreating(false);
    }
  };

  if (userLoading || loading)
    return <PageSkeleton variant="documents" label="Loading your workspace…" />;
  if (!user || error || !documents)
    return (
      <main className="loading-screen">
        <div className="loading-error">
          <h1>Unable to open workspace</h1>
          <p>{error?.message ?? 'Please sign in to continue.'}</p>
          <button className="button subtle" onClick={() => router.replace('/documents')}>
            Back to your workspaces
          </button>
        </div>
      </main>
    );

  return (
    <AppShell user={user} activeWorkspaceId={workspaceId}>
      <header className="workspace-topbar">
        <div className="workspace-location">
          <WorkspaceTabs workspaceId={workspaceId} current="documents" />
        </div>
        <div className="topbar-actions">
          <button className="button primary" onClick={newDocument} disabled={creating}>
            {creating ? 'Creating…' : '+ New document'}
          </button>
        </div>
      </header>
      <div className="editor-body">
        {createError && (
          <div className="alert error" role="alert">
            {createError}
          </div>
        )}
        <WorkspacePresencePanel
          workspaceId={workspaceId}
          currentUserId={user.id}
          onSessionExpired={expireSession}
        />
        <DocumentList workspaceId={workspaceId} userId={user.id} documents={documents} />
      </div>
    </AppShell>
  );
}
