'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ApiError } from '@/src/apiClient';
import { signInPath } from '@/src/auth/authState';
import { Brand } from '@/src/components/ui';
import { Skeleton } from '@/src/components/primitives/skeleton';

/** Placeholder for the content area while its data loads. */
export function ContentSkeleton({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="editor-body" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton className="mb-6 h-8 w-1/3" />
      <Skeleton className="mb-3 h-14 w-full" />
      <Skeleton className="mb-3 h-14 w-full" />
      <Skeleton className="h-14 w-2/3" />
    </div>
  );
}

/** The app frame drawn before the session is known, so the layout never jumps or flashes. */
export function ShellSkeleton() {
  return (
    <main className="workspace">
      <aside className="sidebar" aria-hidden="true">
        <div className="sidebar-brand">
          <Brand />
        </div>
        <Skeleton className="mb-4 h-9 w-full" />
        <Skeleton className="mb-2 h-6 w-3/4" />
        <Skeleton className="mb-2 h-6 w-2/3" />
        <Skeleton className="h-6 w-3/4" />
      </aside>
      <section className="editor-workspace">
        <ContentSkeleton />
      </section>
    </main>
  );
}

type Subject = 'workspace' | 'members' | 'invitations' | 'document';

function describe(error: Error, subject: Subject): { title: string; detail: string } {
  const status = error instanceof ApiError ? error.status : undefined;
  if (status === 401) return { title: 'Your session has ended', detail: 'Sign in to continue.' };
  if (status === 403)
    return {
      title: 'No access',
      detail:
        subject === 'document'
          ? 'You do not have access to this document.'
          : 'You are not a member of this workspace.',
    };
  if (status === 404)
    return {
      title: 'Not found',
      detail:
        subject === 'document'
          ? 'This document does not exist or was deleted.'
          : 'This workspace does not exist or was deleted.',
    };
  return {
    title: `Unable to load ${subject === 'members' || subject === 'invitations' ? subject : `this ${subject}`}`,
    detail: status === 0 ? error.message : 'Something went wrong. Try again in a moment.',
  };
}

/**
 * An error for one page, drawn inside the content area so the sidebar stays in place. Only
 * failures that a retry can fix offer Retry; access and not-found errors offer a way back.
 */
export function LoadError({
  error,
  subject,
  onRetry,
}: {
  error: Error;
  subject: Subject;
  onRetry: () => void;
}) {
  const pathname = usePathname();
  const status = error instanceof ApiError ? error.status : undefined;
  const { title, detail } = describe(error, subject);
  return (
    <div className="editor-body">
      <div className="loading-error mx-auto py-16" role="alert">
        <h1>{title}</h1>
        <p>{detail}</p>
        {status === 401 ? (
          <Link className="button primary" href={signInPath(pathname)}>
            Sign in
          </Link>
        ) : status === 403 || status === 404 ? (
          <Link className="button subtle" href="/documents">
            Back to your workspaces
          </Link>
        ) : (
          <button type="button" className="button primary" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

/** The session check itself failed (not a sign-out): there is no user to draw the shell for. */
export function SessionCheckFailed({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <main className="loading-screen">
      <div className="loading-error" role="alert">
        <h1>Unable to reach MarkSync</h1>
        <p>
          {error instanceof ApiError && error.status === 0
            ? error.message
            : 'Something went wrong. Try again in a moment.'}
        </p>
        <button type="button" className="button primary" onClick={onRetry}>
          Retry
        </button>
      </div>
    </main>
  );
}
