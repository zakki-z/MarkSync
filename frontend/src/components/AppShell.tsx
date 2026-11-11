'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthUser } from '@/src/authService';
import { Brand } from '@/src/components/ui';
import { WorkspaceSwitcher } from '@/src/components/WorkspaceSwitcher';
import { useEndSession } from '@/src/hooks/useEndSession';
import { useWorkspaces } from '@/src/hooks/useWorkspaces';
import { createWorkspace } from '@/src/workspaceService';

/** Sidebar with the workspace switcher and profile for signed-in users. */
export function AppShell({
  user,
  activeWorkspaceId,
  children,
}: {
  user: AuthUser;
  activeWorkspaceId: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const endSession = useEndSession();
  const { data: workspaces, setData: setWorkspaces } = useWorkspaces();
  const [error, setError] = useState('');

  const addWorkspace = async () => {
    const name = window.prompt('Name of the new workspace')?.trim();
    if (!name) return;
    try {
      const created = await createWorkspace(name);
      setWorkspaces([created, ...(workspaces ?? [])]);
      router.push(`/w/${created.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to create workspace.');
    }
  };

  return (
    <main className="workspace">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Brand />
        </div>
        {workspaces && (
          <WorkspaceSwitcher
            workspaces={workspaces}
            activeId={activeWorkspaceId}
            onSelect={(id) => router.push(`/w/${id}`)}
            onCreate={addWorkspace}
          />
        )}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="profile-bar">
          <div className="profile-avatar">{user.email.charAt(0).toUpperCase()}</div>
          <div className="profile-info">
            <strong>{user.email}</strong>
            <span>{user.role}</span>
          </div>
          <button
            className="logout-button"
            onClick={endSession}
            title="Sign out"
            aria-label="Sign out"
          >
            ↗
          </button>
        </div>
      </aside>
      <section className="editor-workspace">{children}</section>
    </main>
  );
}
