'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { ApiError } from '@/src/apiClient';
import { signInPath } from '@/src/auth/authState';
import { useAuth, useUser } from '@/src/auth/AuthProvider';
import { DocumentEditor } from '@/src/components/DocumentEditor';
import { ContentSkeleton, LoadError } from '@/src/components/PageStates';
import { Brand } from '@/src/components/ui';
import { useDocument } from '@/src/hooks/useDocument';

/** Header for anonymous visitors, who read public documents without the app shell. */
function PublicFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <main className="workspace public-view">
      <section className="editor-workspace">
        <header className="workspace-topbar">
          <Brand />
          <Link className="button subtle" href={signInPath(pathname)}>
            Sign in
          </Link>
        </header>
        {children}
      </section>
    </main>
  );
}

export default function DocumentPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { expire } = useAuth();
  const user = useUser();
  const { docId } = useParams<{ docId: string }>();
  const { data: document, error, loading, reload } = useDocument(Number(docId));

  let content: React.ReactNode;
  if (loading) {
    content = <ContentSkeleton variant="document" label="Loading document…" />;
  } else if (!document) {
    const status = error instanceof ApiError ? error.status : undefined;
    content =
      !user && (status === 401 || status === 403) ? (
        <div className="editor-body">
          <div className="loading-error mx-auto py-16" role="alert">
            <h1>This document is private</h1>
            <p>Sign in to view it.</p>
            <Link className="button primary" href={signInPath(pathname)}>
              Sign in
            </Link>
          </div>
        </div>
      ) : (
        <LoadError
          error={error ?? new Error('Unable to load this document.')}
          subject="document"
          onRetry={reload}
        />
      );
  } else {
    content = (
      <DocumentEditor
        key={document.id}
        document={document}
        user={user}
        onDeleted={() => router.push(`/w/${document.workspaceId}`)}
        onSessionExpired={expire}
      />
    );
  }

  return user ? content : <PublicFrame>{content}</PublicFrame>;
}
