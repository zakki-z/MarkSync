'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError } from '@/src/apiClient';
import { signInPath } from '@/src/auth/authState';
import { BrandTile } from '@/src/components/common/Identity';
import { Button } from '@/src/components/primitives/button';
import { Skeleton } from '@/src/components/primitives/skeleton';
import { cn } from '@/src/lib/utils';

/** `height` is in pixels and matches the element that replaces the bar, so nothing moves. */
const Bar = ({ className = '', height }: { className?: string; height?: number }) => (
  <Skeleton className={className} style={{ height }} />
);

/** The content column of workspace pages: what every page body sits in. */
export function PageBody({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-1 pt-5 pb-10 sm:px-4 sm:pt-7',
        wide ? 'max-w-none' : 'max-w-content',
      )}
    >
      {children}
    </div>
  );
}

/** A friendly empty or no-results message, inside a panel or on its own. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <span className="mb-3 grid size-10 place-items-center rounded-xl border border-panel-border bg-hover text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * An error drawn inside the content area, so the shell stays in place. `action` is the way out:
 * Retry, Back, or Sign in.
 */
export function ErrorState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="glass-flat mx-auto mt-6 max-w-md rounded-panel px-6 py-10 text-center"
    >
      <span className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-destructive-tint text-destructive">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </span>
      <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{detail}</p>
      {action && <div className="mt-5 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Title, subtitle and section tabs of a workspace page, before the workspace is known. */
export function HeaderSkeleton() {
  return (
    <div aria-hidden="true">
      <Bar className="w-64 max-w-full rounded-lg" height={40} />
      <Bar className="mt-1.5 w-48 rounded-md" height={20} />
      <Bar className="mt-5 mb-5 w-[300px] max-w-full rounded-full" height={42} />
    </div>
  );
}

/** Rows of a list panel; `rows` placeholders with the height of real rows. */
export function ListSkeleton({ rows = 4, header = true }: { rows?: number; header?: boolean }) {
  return (
    <div aria-hidden="true" className="glass-flat overflow-hidden rounded-panel">
      {header && (
        <div className="flex h-14 items-center justify-between border-b border-panel-border px-4">
          <Bar className="w-28" height={14} />
          <Bar className="w-44 rounded-lg" height={32} />
        </div>
      )}
      <div className="p-1.5">
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex h-[60px] items-center gap-3 px-2.5">
            <Bar className="size-9 shrink-0 rounded-lg" />
            <div className="flex-1">
              <Bar className="w-1/3" height={14} />
              <Bar className="mt-2 w-1/5" height={12} />
            </div>
            <Bar className="hidden w-16 sm:block" height={12} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Placeholder for the content area while its data loads. The variants follow the layout of the
 * page they stand in for, with the heights of the real elements, so nothing moves when the data
 * arrives:
 * - `list`: a panel of rows (members, invitations);
 * - `documents`: the quick-action cards and the document list.
 */
export function ContentSkeleton({
  label = 'Loading…',
  variant = 'list',
}: {
  label?: string;
  variant?: 'list' | 'documents';
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {variant === 'documents' && (
        <div aria-hidden="true" className="mb-5 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((card) => (
            <Bar key={card} className="rounded-card" height={92} />
          ))}
        </div>
      )}
      <ListSkeleton rows={variant === 'documents' ? 5 : 3} header={variant === 'documents'} />
    </div>
  );
}

/** The document page before the document is known: top bar, then the two editor panes. */
export function DocumentSkeleton({ label = 'Loading document…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-1 flex-col gap-3">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="glass flex h-14 items-center gap-3 rounded-panel px-3">
        <Bar className="w-56" height={16} />
        <div className="flex-1" />
        <Bar className="hidden w-48 rounded-lg sm:block" height={32} />
        <Bar className="w-20 rounded-lg" height={32} />
      </div>
      <div aria-hidden="true" className="grid flex-1 gap-3 lg:grid-cols-2">
        {[0, 1].map((pane) => (
          <div key={pane} className="glass-flat min-h-[60vh] rounded-panel p-6">
            <Bar className="w-2/3 rounded-lg" height={30} />
            <Bar className="mt-3 w-1/3" height={12} />
            <Bar className="mt-8 w-5/6" height={14} />
            <Bar className="mt-3 w-3/4" height={14} />
            <Bar className="mt-3 w-2/3" height={14} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The app frame drawn before the session is known, so the layout never jumps or flashes: the
 * sidebar and top bar of the real frame, with placeholders where the data goes.
 */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh gap-3 p-3" aria-busy="true">
      <aside
        aria-label="Sidebar"
        className="glass sticky top-3 hidden h-[calc(100dvh-1.5rem)] w-[248px] shrink-0 flex-col rounded-panel p-3 md:flex"
      >
        <div className="flex h-10 items-center gap-2.5 px-1.5">
          <BrandTile />
          <span className="text-sm font-semibold tracking-tight text-foreground">MarkSync</span>
        </div>
        <Bar className="mt-3 rounded-lg" height={36} />
        <div className="mt-5 flex flex-col gap-0.5">
          <span className="section-label mb-1 px-2 leading-6">Workspaces</span>
          {[0, 1, 2].map((row) => (
            <Bar key={row} className="rounded-item" height={36} />
          ))}
        </div>
        <div className="flex-1" />
        <Bar className="rounded-card" height={50} />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="glass flex h-14 items-center rounded-panel px-3">
          <Bar className="w-48" height={16} />
        </div>
        <PageBody>
          <HeaderSkeleton />
          <ContentSkeleton />
        </PageBody>
      </main>
    </div>
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
    <ErrorState
      title={title}
      detail={detail}
      action={
        status === 401 ? (
          <Button asChild>
            <Link href={signInPath(pathname)}>Sign in</Link>
          </Button>
        ) : status === 403 || status === 404 ? (
          <Button asChild variant="outline">
            <Link href="/documents">Back to your workspaces</Link>
          </Button>
        ) : (
          <Button type="button" onClick={onRetry}>
            Retry
          </Button>
        )
      }
    />
  );
}

/** A full-screen message where there is no shell to draw (session check, entry redirect). */
export function FullScreenMessage({ children }: { children: ReactNode }) {
  return <main className="grid min-h-dvh place-items-center p-6">{children}</main>;
}

/** The session check itself failed (not a sign-out): there is no user to draw the shell for. */
export function SessionCheckFailed({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <FullScreenMessage>
      <ErrorState
        title="Unable to reach MarkSync"
        detail={
          error instanceof ApiError && error.status === 0
            ? error.message
            : 'Something went wrong. Try again in a moment.'
        }
        action={
          <Button type="button" onClick={onRetry}>
            Retry
          </Button>
        }
      />
    </FullScreenMessage>
  );
}
