'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth, useUser } from '@/src/auth/AuthProvider';
import { WorkspaceTabs } from '@/src/components/WorkspaceTabs';
import { DocumentList } from '@/src/components/DocumentList';
import { ContentSkeleton, LoadError } from '@/src/components/PageStates';
import { WorkspacePresencePanel } from '@/src/components/WorkspacePresencePanel';
import { useWorkspaceDocuments } from '@/src/hooks/useWorkspaceDocuments';
import { useCreateDocument } from '@/src/queries/mutations';

export default function WorkspaceDashboard() {
  const router = useRouter();
  const { expire } = useAuth();
  const user = useUser();
  const workspaceId = Number(useParams<{ workspaceId: string }>().workspaceId);
  const documents = useWorkspaceDocuments(workspaceId);
  const createDocument = useCreateDocument().mutateAsync;
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

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

  if (!user) return null;
  return (
    <>
      <header className="workspace-topbar">
        <div className="workspace-location">
          <WorkspaceTabs workspaceId={workspaceId} current="documents" />
        </div>
        <div className="topbar-actions">
          <button
            className="button primary"
            onClick={newDocument}
            disabled={creating || !documents.data}
          >
            {creating ? 'Creating…' : '+ New document'}
          </button>
        </div>
      </header>
      {documents.loading ? (
        <ContentSkeleton variant="documents" label="Loading documents…" />
      ) : documents.error || !documents.data ? (
        <LoadError
          error={documents.error ?? new Error('Unable to load documents.')}
          subject="workspace"
          onRetry={documents.reload}
        />
      ) : (
        <div className="editor-body">
          {createError && (
            <div className="alert error" role="alert">
              {createError}
            </div>
          )}
          <WorkspacePresencePanel
            workspaceId={workspaceId}
            currentUserId={user.id}
            onSessionExpired={expire}
          />
          <DocumentList workspaceId={workspaceId} userId={user.id} documents={documents.data} />
        </div>
      )}
    </>
  );
}
