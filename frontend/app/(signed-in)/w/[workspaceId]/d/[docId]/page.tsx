'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { LogIn } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError } from '@/src/apiClient';
import { signInPath } from '@/src/auth/authState';
import { useAuth, useUser } from '@/src/auth/AuthProvider';
import { BrandTile } from '@/src/components/common/Identity';
import { DocumentEditor } from '@/src/components/DocumentEditor';
import { DocumentSkeleton, ErrorState, LoadError } from '@/src/components/PageStates';
import { Button } from '@/src/components/primitives/button';
import { Breadcrumb, TopBar } from '@/src/components/shell/TopBar';
import { useDocument } from '@/src/hooks/useDocument';

/** Anonymous visitors read public documents without the app shell. */
function PublicFrame({ children }: { children: ReactNode }) {
  return <main className="flex min-h-dvh flex-col gap-3 p-3">{children}</main>;
}

/** The bar shown to anonymous visitors before a document can be drawn. */
function PublicBar() {
  const pathname = usePathname();
  return (
    <TopBar
      breadcrumb={
        <Breadcrumb
          items={[
            {
              label: (
                <span className="inline-flex items-center gap-2 font-semibold text-foreground">
                  <BrandTile className="size-6 text-xs" /> MarkSync
                </span>
              ),
            },
          ]}
        />
      }
    >
      <Button asChild size="sm" variant="outline">
        <Link href={signInPath(pathname)}>
          <LogIn /> Sign in
        </Link>
      </Button>
    </TopBar>
  );
}

export default function DocumentPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { expire } = useAuth();
  const user = useUser();
  const { docId } = useParams<{ docId: string }>();
  const { data: document, error, loading, reload } = useDocument(Number(docId));

  let content: ReactNode;
  if (loading) {
    content = <DocumentSkeleton />;
  } else if (!document) {
    const status = error instanceof ApiError ? error.status : undefined;
    content =
      !user && (status === 401 || status === 403) ? (
        <>
          <PublicBar />
          <ErrorState
            title="This document is private"
            detail="Sign in to view it."
            action={
              <Button asChild>
                <Link href={signInPath(pathname)}>Sign in</Link>
              </Button>
            }
          />
        </>
      ) : (
        <>
          {!user && <PublicBar />}
          <LoadError
            error={error ?? new Error('Unable to load this document.')}
            subject="document"
            onRetry={reload}
          />
        </>
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
