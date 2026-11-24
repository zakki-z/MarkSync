'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ApiError } from '@/src/apiClient';
import { signInPath } from '@/src/auth/authState';
import { Brand } from '@/src/components/ui';
import { Skeleton } from '@/src/components/primitives/skeleton';

/** `height` is in pixels and matches the element that replaces the bar, so nothing moves. */
const Bar = ({ className = '', height }: { className?: string; height?: number }) => (
  <Skeleton className={`motion-reduce:animate-none ${className}`} style={{ height }} />
);

/** Room for the presence panel (200 px when empty) until it is known whether there is one. */
export function PresencePanelPlaceholder() {
  return <Bar className="mb-5" height={200} />;
}

/** The sidebar's workspace list before it is known: same heading and row height as the list. */
export function WorkspaceListPlaceholder() {
  return (
    <nav className="sidebar-scroll" aria-hidden="true">
      <h2 className="sidebar-heading">Workspaces</h2>
      <ul className="list-rows">
        {[0, 1].map((row) => (
          <li key={row} className="list-row">
            <Bar className="w-full" height={40} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Placeholder for the content area while its data loads. The variants follow the layout of the
 * page they stand in for, with the heights of the real elements (measured with an empty presence
 * panel), so nothing moves when the data arrives:
 * - `list`: a column of rows (members, invitations);
 * - `documents`: the presence panel, the search box and the document rows;
 * - `document`: the whole editor page, top bar included, because the editor draws its own.
 */
export function ContentSkeleton({
  label = 'Loading…',
  variant = 'list',
}: {
  label?: string;
  variant?: 'list' | 'documents' | 'document';
}) {
  const status = { role: 'status', 'aria-live': 'polite', 'aria-busy': true } as const;
  if (variant === 'document')
    return (
      <>
        <header className="workspace-topbar" aria-hidden="true">
          <Bar className="w-56" height={20} />
          <Bar className="w-36" height={40} />
        </header>
        <div className="editor-body" {...status}>
          <span className="sr-only">{label}</span>
          <div aria-hidden="true">
            <PresencePanelPlaceholder />
            <div className="editor-heading">
              <Bar className="w-3/4" height={124} />
            </div>
            <Bar height={48} />
            <div className="editing-surface">
              <Bar className="m-7 w-2/3" height={16} />
              <Bar className="m-7 w-1/2" height={16} />
            </div>
          </div>
        </div>
      </>
    );
  return (
    <div className="editor-body" {...status}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">
        {variant === 'documents' ? (
          <>
            <PresencePanelPlaceholder />
            <Bar className="mb-2.5 w-28" height={18} />
            <Bar className="mb-4" height={40} />
            <div className="flex flex-col gap-1">
              {[0, 1, 2, 3, 4, 5].map((row) => (
                <Bar key={row} height={67} />
              ))}
            </div>
          </>
        ) : (
          <>
            <Bar className="mb-6 h-8 w-1/3" />
            <Bar className="mb-3 h-14 w-full" />
            <Bar className="mb-3 h-14 w-full" />
            <Bar className="h-14 w-2/3" />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The app frame drawn before the session is known, so the layout never jumps or flashes. It has
 * the sidebar chrome and the top bar of the real frame, so the frame is already in place when the
 * session resolves.
 */
export function ShellSkeleton() {
  return (
    <main className="workspace">
      <aside className="sidebar" aria-hidden="true">
        <div className="sidebar-brand">
          <Brand />
        </div>
        <button type="button" className="button subtle new-workspace" disabled tabIndex={-1}>
          + New workspace
        </button>
        <span className="sidebar-link">My invitations</span>
        <WorkspaceListPlaceholder />
        <div className="profile-bar">
          <Bar className="w-32" height={34} />
        </div>
      </aside>
      <section className="editor-workspace">
        <header className="workspace-topbar" aria-hidden="true">
          <Bar className="w-56" height={20} />
        </header>
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
