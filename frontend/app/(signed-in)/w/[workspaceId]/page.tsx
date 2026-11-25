'use client';

import { useParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useUser } from '@/src/auth/AuthProvider';
import { DocumentList } from '@/src/components/DocumentList';
import { ContentSkeleton, LoadError, PageBody } from '@/src/components/PageStates';
import { Button } from '@/src/components/primitives/button';
import { QuickActions } from '@/src/components/QuickActions';
import { useShell } from '@/src/components/shell/ShellContext';
import { WorkspaceHeader, WorkspaceTopBar } from '@/src/components/WorkspaceTabs';
import { useMembership } from '@/src/hooks/useMembership';
import { useNewDocument } from '@/src/hooks/useNewDocument';
import { useWorkspaceDocuments } from '@/src/hooks/useWorkspaceDocuments';

export default function WorkspaceDashboard() {
  const user = useUser();
  const shell = useShell();
  const workspaceId = Number(useParams<{ workspaceId: string }>().workspaceId);
  const documents = useWorkspaceDocuments(workspaceId);
  const membership = useMembership(workspaceId).data;
  const { create, creating } = useNewDocument();

  if (!user) return null;
  const invite =
    membership?.canManageMembers && shell ? () => shell.openInvite(workspaceId) : undefined;
  return (
    <>
      <WorkspaceTopBar workspaceId={workspaceId} current="documents" />
      <PageBody>
        {documents.error ? (
          <LoadError error={documents.error} subject="workspace" onRetry={documents.reload} />
        ) : (
          <>
            <WorkspaceHeader workspaceId={workspaceId} current="documents" />
            {documents.loading || !documents.data ? (
              <ContentSkeleton variant="documents" label="Loading documents…" />
            ) : (
              <>
                <QuickActions
                  workspaceId={workspaceId}
                  documents={documents.data}
                  creating={creating}
                  onNewDocument={() => create(workspaceId)}
                  onInvite={invite}
                />
                <DocumentList
                  workspaceId={workspaceId}
                  userId={user.id}
                  documents={documents.data}
                  emptyAction={
                    <Button size="sm" onClick={() => create(workspaceId)} disabled={creating}>
                      <Plus /> New document
                    </Button>
                  }
                />
              </>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}
