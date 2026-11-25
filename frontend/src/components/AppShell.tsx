'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { AuthUser } from '@/src/authService';
import { useAuth } from '@/src/auth/AuthProvider';
import { InvitationsProvider } from '@/src/components/InvitationsContext';
import { WorkspacePresenceProvider } from '@/src/components/presence/WorkspacePresence';
import { Toaster } from '@/src/components/primitives/sonner';
import { TooltipProvider } from '@/src/components/primitives/tooltip';
import { ShellProvider, type Shell } from '@/src/components/shell/ShellContext';
import { Sidebar, SidebarRail, type SidebarProps } from '@/src/components/shell/Sidebar';
import { useEndSession } from '@/src/hooks/useEndSession';
import { useMyInvitations } from '@/src/hooks/useMyInvitations';
import { MAX_PINS, usePins } from '@/src/hooks/usePins';
import { usePrefetch } from '@/src/hooks/usePrefetch';
import { useWorkspaces } from '@/src/hooks/useWorkspaces';
import { cn } from '@/src/lib/utils';
import type { Workspace } from '@/src/workspaceService';

/*
 * Overlays are needed only once someone opens them, and they carry most of the UI libraries
 * (cmdk, Select, Dialog, Sheet). They load on first use and then stay mounted, so closing
 * animations and focus restoration work as usual.
 */
const CommandPalette = dynamic(
  () => import('@/src/components/CommandPalette').then((module) => module.CommandPalette),
  { ssr: false },
);
const InviteDialog = dynamic(
  () => import('@/src/components/InviteDialog').then((module) => module.InviteDialog),
  { ssr: false },
);
const NewWorkspaceDialog = dynamic(
  () =>
    import('@/src/components/shell/NewWorkspaceDialog').then((module) => module.NewWorkspaceDialog),
  { ssr: false },
);
const NavigationDrawer = dynamic(
  () => import('@/src/components/shell/NavigationDrawer').then((module) => module.NavigationDrawer),
  { ssr: false },
);

type Overlay = 'palette' | 'invite' | 'workspace' | 'drawer';

/**
 * The signed-in frame: a floating glass sidebar (a drawer on narrow screens, an icon rail on
 * document pages) beside the page column, plus the overlays every page can open. It stays mounted
 * while moving between workspaces, sections and documents.
 */
export function AppShell({
  user,
  activeWorkspaceId,
  documentOpen = false,
  children,
}: {
  user: AuthUser;
  activeWorkspaceId?: number;
  /** A document page is open: the sidebar starts as the icon rail. */
  documentOpen?: boolean;
  children: ReactNode;
}) {
  const { expire } = useAuth();
  const endSession = useEndSession();
  const { data: workspaces } = useWorkspaces();
  const invitations = useMyInvitations();
  const pins = usePins(`marksync:pins:workspaces:${user.id}`);
  const prefetch = usePrefetch();

  const [navigationOpen, setNavigationOpen] = useState(false);
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [inviteWorkspace, setInviteWorkspace] = useState<number>();
  const [railExpanded, setRailExpanded] = useState(false);
  // Which overlays have been opened at least once, and so are loaded.
  const [loaded, setLoaded] = useState<ReadonlySet<Overlay>>(() => new Set());
  const load = useCallback(
    (overlay: Overlay) =>
      setLoaded((current) => (current.has(overlay) ? current : new Set(current).add(overlay))),
    [],
  );
  const collapsed = documentOpen && !railExpanded;

  // Undo runs after later renders, so it must reach the pins as they are then.
  const latestPins = useRef(pins);
  useEffect(() => {
    latestPins.current = pins;
  });
  const togglePin = useCallback((workspace: Workspace) => {
    const wasPinned = latestPins.current.isPinned(workspace.id);
    if (!latestPins.current.toggle(workspace.id)) {
      toast.error(`You can pin up to ${MAX_PINS} workspaces. Unpin one first.`);
      return;
    }
    toast(`${wasPinned ? 'Unpinned' : 'Pinned'} ${workspace.name}`, {
      action: { label: 'Undo', onClick: () => latestPins.current.toggle(workspace.id) },
    });
  }, []);

  // ⌘K / Ctrl+K opens the palette. Only while the app has focus (keydown never fires otherwise),
  // and never when something inside the page, such as the editor, already handled the keys.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      load('palette');
      setPaletteOpen((open) => !open);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [load]);

  const shell = useMemo<Shell>(
    () => ({
      openPalette: () => {
        load('palette');
        setPaletteOpen(true);
      },
      openInvite: (workspaceId) => {
        load('invite');
        setInviteWorkspace(workspaceId);
      },
      openNewWorkspace: () => {
        load('workspace');
        setNewWorkspaceOpen(true);
      },
      openNavigation: () => {
        load('drawer');
        setNavigationOpen(true);
      },
      sidebarCollapsed: collapsed,
      toggleSidebar: documentOpen ? () => setRailExpanded((expanded) => !expanded) : undefined,
    }),
    [collapsed, documentOpen, load],
  );

  const sidebar: SidebarProps = {
    user,
    workspaces,
    activeWorkspaceId,
    pinned: pins.pinned,
    pendingInvitations: invitations.data?.length ?? 0,
    onTogglePin: togglePin,
    onPrefetch: prefetch.workspace,
    onSearch: shell.openPalette,
    onNewWorkspace: shell.openNewWorkspace,
    onSignOut: endSession,
  };

  return (
    <ShellProvider value={shell}>
      <TooltipProvider delayDuration={400}>
        <div className="flex min-h-dvh gap-3 p-3">
          <aside
            aria-label="Sidebar"
            className={cn(
              'glass sticky top-3 hidden h-[calc(100dvh-1.5rem)] shrink-0 overflow-hidden rounded-panel transition-[width] duration-(--duration-normal) ease-standard md:block',
              collapsed ? 'w-16' : 'w-[248px]',
            )}
          >
            {collapsed ? (
              <SidebarRail {...sidebar} onExpand={() => setRailExpanded(true)} />
            ) : (
              <Sidebar
                {...sidebar}
                onCollapse={documentOpen ? () => setRailExpanded(false) : undefined}
              />
            )}
          </aside>
          {loaded.has('drawer') && (
            <NavigationDrawer
              open={navigationOpen}
              onOpenChange={setNavigationOpen}
              sidebar={sidebar}
            />
          )}
          <main className="flex min-w-0 flex-1 flex-col gap-3">
            <InvitationsProvider value={invitations}>
              <WorkspacePresenceProvider workspaceId={activeWorkspaceId} onSessionExpired={expire}>
                {children}
              </WorkspacePresenceProvider>
            </InvitationsProvider>
          </main>
        </div>
        {loaded.has('palette') && (
          <CommandPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            onNewWorkspace={shell.openNewWorkspace}
            onInvite={shell.openInvite}
          />
        )}
        {loaded.has('workspace') && (
          <NewWorkspaceDialog open={newWorkspaceOpen} onOpenChange={setNewWorkspaceOpen} />
        )}
        {loaded.has('invite') && (
          <InviteDialog
            workspaceId={inviteWorkspace}
            onClose={() => setInviteWorkspace(undefined)}
          />
        )}
        <Toaster />
      </TooltipProvider>
    </ShellProvider>
  );
}
