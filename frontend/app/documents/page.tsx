'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/src/apiClient';
import { ErrorState, FullScreenMessage, ShellSkeleton } from '@/src/components/PageStates';
import { Button } from '@/src/components/primitives/button';
import { useEndSession } from '@/src/hooks/useEndSession';
import { queryKeys, staleTime } from '@/src/queries/keys';
import { createWorkspace, listWorkspaces } from '@/src/workspaceService';

/** Entry point after login: opens the most recent workspace, creating a personal one if needed. */
export default function DocumentsEntry() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const endSession = useEndSession();
  const started = useRef(-1);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    // Runs once per attempt, even when React mounts effects twice in development.
    if (started.current === attempt) return;
    started.current = attempt;
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
  }, [router, endSession, attempt, queryClient]);

  // The shell's own skeleton, so the redirect to the workspace does not flash a different frame.
  if (!error) return <ShellSkeleton />;
  return (
    <FullScreenMessage>
      <ErrorState
        title="Unable to open workspace"
        detail={error}
        action={
          <Button
            variant="outline"
            onClick={() => {
              setError('');
              setAttempt((n) => n + 1);
            }}
          >
            Retry
          </Button>
        }
      />
    </FullScreenMessage>
  );
}
