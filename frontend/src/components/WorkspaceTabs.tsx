'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { HeaderSkeleton } from '@/src/components/PageStates';
import { Button } from '@/src/components/primitives/button';
import { useOnlineUsers, usePresenceStatus } from '@/src/components/presence/WorkspacePresence';
import { ChatButton, LiveStatus, PresenceAvatars } from '@/src/components/presence/PresenceWidgets';
import { useShell } from '@/src/components/shell/ShellContext';
import { Breadcrumb, TopBar } from '@/src/components/shell/TopBar';
import { useMembership } from '@/src/hooks/useMembership';
import { useNewDocument } from '@/src/hooks/useNewDocument';
import { useWorkspaceDocuments } from '@/src/hooks/useWorkspaceDocuments';
import { useWorkspaces } from '@/src/hooks/useWorkspaces';
import { cn } from '@/src/lib/utils';

const TABS = [
  { id: 'documents', label: 'Documents', path: '' },
  { id: 'members', label: 'Members', path: '/members' },
  { id: 'invitations', label: 'Invitations', path: '/invitations' },
] as const;

export type WorkspaceTab = (typeof TABS)[number]['id'];

/** The name of a workspace from the cached list the sidebar already loaded. */
export function useWorkspaceName(workspaceId: number): string | undefined {
  return useWorkspaces().data?.find((workspace) => workspace.id === workspaceId)?.name;
}

/**
 * Switches between the sections of one workspace. They are separate pages, so this is navigation
 * (links with aria-current), drawn as a segmented glass pill.
 */
export function WorkspaceTabs({
  workspaceId,
  current,
}: {
  workspaceId: number;
  current: WorkspaceTab;
}) {
  return (
    <nav aria-label="Workspace sections" className="glass-flat inline-flex rounded-full p-1">
      {TABS.map((tab) => {
        const active = tab.id === current;
        return (
          <Link
            key={tab.id}
            href={`/w/${workspaceId}${tab.path}`}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium transition-colors duration-(--duration-fast) ease-standard',
              active
                ? 'bg-accent-tint text-foreground ring-1 ring-accent-ring ring-inset'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** "· 2 online", from the presence store; a leaf, so presence changes re-render only this. */
const OnlineSummary = memo(function OnlineSummary({ separator }: { separator: boolean }) {
  const users = useOnlineUsers();
  const status = usePresenceStatus();
  if (status !== 'connected' || !users) return null;
  return (
    <>
      {separator && <span aria-hidden="true">·</span>}
      <span className="inline-flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
        {users.length} online
      </span>
    </>
  );
});

/** Large title, subtitle (documents, who is online) and the section tabs. */
export function WorkspaceHeader({
  workspaceId,
  current,
  aside,
}: {
  workspaceId: number;
  current: WorkspaceTab;
  aside?: ReactNode;
}) {
  const name = useWorkspaceName(workspaceId);
  const documents = useWorkspaceDocuments(workspaceId).data;
  if (name === undefined) return <HeaderSkeleton />;
  return (
    <div className="mb-5">
      <h1 className="text-[28px] leading-10 font-bold tracking-[-0.03em] text-foreground sm:text-[34px]">
        {name}
      </h1>
      <p className="mt-1.5 flex h-5 flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        {documents && (
          <span>
            {documents.length} {documents.length === 1 ? 'document' : 'documents'}
          </span>
        )}
        <OnlineSummary separator={documents !== undefined} />
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <WorkspaceTabs workspaceId={workspaceId} current={current} />
        {aside}
      </div>
    </div>
  );
}

const SECTION_LABELS: Record<WorkspaceTab, string> = {
  documents: 'Documents',
  members: 'Members',
  invitations: 'Invitations',
};

/** The top bar of the workspace sections: breadcrumb, presence, chat and "New document". */
export function WorkspaceTopBar({
  workspaceId,
  current,
}: {
  workspaceId: number;
  current: WorkspaceTab;
}) {
  const shell = useShell();
  const name = useWorkspaceName(workspaceId);
  const membership = useMembership(workspaceId).data;
  const { create, creating } = useNewDocument();
  return (
    <TopBar
      breadcrumb={
        <Breadcrumb
          items={[
            { label: name ?? 'Workspace', href: `/w/${workspaceId}` },
            { label: SECTION_LABELS[current] },
          ]}
        />
      }
    >
      <LiveStatus className="hidden sm:inline-flex" />
      <PresenceAvatars
        workspaceName={name ?? 'this workspace'}
        onInvite={
          membership?.canManageMembers && shell ? () => shell.openInvite(workspaceId) : undefined
        }
      />
      <ChatButton />
      <Button
        size="sm"
        onClick={() => create(workspaceId)}
        disabled={creating}
        aria-label="New document"
        className="max-sm:size-8 max-sm:px-0"
      >
        <Plus />
        <span className="max-sm:sr-only">{creating ? 'Creating…' : 'New document'}</span>
      </Button>
    </TopBar>
  );
}
