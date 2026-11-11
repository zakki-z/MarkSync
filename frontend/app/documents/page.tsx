'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/src/apiClient';
import { useEndSession } from '@/src/hooks/useEndSession';
import { createWorkspace, listWorkspaces } from '@/src/workspaceService';

/** Entry point after login: opens the most recent workspace, creating a personal one if needed. */
export default function DocumentsEntry() {
  const router = useRouter();
  const endSession = useEndSession();
  const started = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    listWorkspaces()
      .then(async (workspaces) => workspaces[0] ?? createWorkspace('Personal'))
      .then((workspace) => router.replace(`/w/${workspace.id}`))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) void endSession();
        else setError(err instanceof Error ? err.message : 'Unable to load your workspaces.');
      });
  }, [router, endSession]);

  if (!error)
    return (
      <main className="loading-screen" aria-live="polite">
        Loading your workspace…
      </main>
    );
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
