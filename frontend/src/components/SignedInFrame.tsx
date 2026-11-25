'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { guardView, signInPath } from '@/src/auth/authState';
import { useAuth } from '@/src/auth/AuthProvider';
import { AppShell } from '@/src/components/AppShell';
import { SessionCheckFailed, ShellSkeleton } from '@/src/components/PageStates';
import { prefetchDocumentData, prefetchWorkspace } from '@/src/queries/prefetch';

/**
 * Route guard and persistent shell for every signed-in screen. Pages render inside the shell and
 * only once the session is known. Document pages stay open to anonymous visitors, because public
 * documents can be read without an account.
 */
export function SignedInFrame({ children }: { children: ReactNode }) {
  const { state, retry } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ workspaceId?: string; docId?: string }>();
  const client = useQueryClient();

  // Pages render only once the session is known, so their requests would wait for the identity
  // check. The page being opened is known from the URL: ask for its data now, in parallel. A
  // request the session cannot make fails exactly as the page's own would.
  const entry = useRef(params);
  useEffect(() => {
    const { workspaceId, docId } = entry.current;
    if (docId) prefetchDocumentData(client, Number(docId));
    else if (workspaceId) prefetchWorkspace(client, Number(workspaceId));
  }, [client]);
  const view = guardView(state, params.docId !== undefined);

  useEffect(() => {
    if (view === 'redirect') router.replace(signInPath(pathname + window.location.search));
  }, [view, router, pathname]);

  switch (view) {
    case 'pending':
    case 'redirect':
      return <ShellSkeleton />;
    case 'error':
      return state.status === 'error' ? (
        <SessionCheckFailed error={state.error} onRetry={retry} />
      ) : null;
    case 'anonymous':
      return children;
    case 'signed-in':
      return state.status === 'authenticated' ? (
        <AppShell
          user={state.user}
          activeWorkspaceId={params.workspaceId ? Number(params.workspaceId) : undefined}
          documentOpen={params.docId !== undefined}
        >
          {children}
        </AppShell>
      ) : null;
  }
}
