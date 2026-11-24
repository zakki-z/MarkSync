'use client';

import { useEffect, type ReactNode } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { guardView, signInPath } from '@/src/auth/authState';
import { useAuth } from '@/src/auth/AuthProvider';
import { AppShell } from '@/src/components/AppShell';
import { SessionCheckFailed, ShellSkeleton } from '@/src/components/PageStates';

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
        >
          {children}
        </AppShell>
      ) : null;
  }
}
