'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ApiError } from '@/src/apiClient';
import { AppShell } from '@/src/components/AppShell';
import { DocumentEditor } from '@/src/components/DocumentEditor';
import { Brand } from '@/src/components/ui';
import { useCurrentUser } from '@/src/hooks/useCurrentUser';
import { useDocument } from '@/src/hooks/useDocument';
import { useEndSession } from '@/src/hooks/useEndSession';

function unavailableMessage(error: Error | undefined): string {
  if (!(error instanceof ApiError)) return error?.message ?? 'Unable to load this document.';
  if (error.status === 401) return 'This document is private. Sign in to view it.';
  if (error.status === 403) return 'You do not have access to this document.';
  if (error.status === 404) return 'Document not found.';
  return error.message;
}

export default function DocumentPage() {
  const router = useRouter();
  const endSession = useEndSession();
  const params = useParams<{ workspaceId: string; docId: string }>();
  const workspaceId = Number(params.workspaceId);
  const { user, loading: userLoading } = useCurrentUser();
  const { data: document, error, loading } = useDocument(Number(params.docId));

  if (userLoading || loading)
    return (
      <main className="loading-screen" aria-live="polite">
        Loading document…
      </main>
    );
  if (!document)
    return (
      <main className="loading-screen">
        <div className="loading-error">
          <h1>Unable to open document</h1>
          <p>{unavailableMessage(error)}</p>
          {user ? (
            <Link className="button subtle" href={`/w/${workspaceId}`}>
              Back to workspace
            </Link>
          ) : (
            <Link className="button primary" href="/auth">
              Sign in
            </Link>
          )}
        </div>
      </main>
    );

  const editor = (
    <DocumentEditor
      key={document.id}
      document={document}
      user={user}
      onDeleted={() => router.push(`/w/${document.workspaceId}`)}
      onSessionExpired={() => void endSession()}
    />
  );
  if (user)
    return (
      <AppShell user={user} activeWorkspaceId={document.workspaceId}>
        {editor}
      </AppShell>
    );
  return (
    <main className="workspace public-view">
      <section className="editor-workspace">
        <header className="workspace-topbar">
          <Brand />
          <Link className="button subtle" href="/auth">
            Sign in
          </Link>
        </header>
        {editor}
      </section>
    </main>
  );
}
