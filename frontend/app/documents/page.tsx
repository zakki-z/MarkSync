'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/src/apiClient';
import { PageSkeleton } from '@/src/components/PageSkeleton';
import { useEndSession } from '@/src/hooks/useEndSession';
import { queryKeys, staleTime } from '@/src/queries/keys';
import { createWorkspace, listWorkspaces } from '@/src/workspaceService';

/** Entry point after login: opens the most recent workspace, creating a personal one if needed. */
export default function DocumentsEntry() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const endSession = useEndSession();
  const started = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Through the cache, so the sidebar of the page opened next already has its workspaces.
    queryClient
      .fetchQuery({
        queryKey: queryKeys.workspaces,
        queryFn: listWorkspaces,
        staleTime: staleTime.list,
      })
      .then(async (workspaces) => {
        if (workspaces[0]) return workspaces[0];
        const created = await createWorkspace('Personal');
        await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces, exact: true });
        return created;
      })
      .then((workspace) => router.replace(`/w/${workspace.id}`))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) void endSession();
        else setError(err instanceof Error ? err.message : 'Unable to load your workspaces.');
      });
  }, [router, endSession, queryClient]);

  if (!error) return <PageSkeleton variant="documents" label="Loading your workspace…" />;
  return (
    <main className="loading-screen">
      <div className="loading-error">
        <h1>Unable to open workspace</h1>
        <p>{error}</p>
        <button className="button subtle" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    </main>
  );
}
