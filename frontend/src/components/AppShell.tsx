'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { AuthUser } from '@/src/authService';
import { useAuth } from '@/src/auth/AuthProvider';
import { CommandPalette } from '@/src/components/CommandPalette';
import { InvitationsProvider } from '@/src/components/InvitationsContext';
import { InviteDialog } from '@/src/components/InviteDialog';
import { WorkspacePresenceProvider } from '@/src/components/presence/WorkspacePresence';
import { Sheet, SheetContent, SheetTitle } from '@/src/components/primitives/sheet';
import { Toaster } from '@/src/components/primitives/sonner';
import { TooltipProvider } from '@/src/components/primitives/tooltip';
import { NewWorkspaceDialog } from '@/src/components/shell/NewWorkspaceDialog';
import { ShellProvider, type Shell } from '@/src/components/shell/ShellContext';
import { Sidebar, SidebarRail, type SidebarProps } from '@/src/components/shell/Sidebar';
import { useEndSession } from '@/src/hooks/useEndSession';
import { useMyInvitations } from '@/src/hooks/useMyInvitations';
import { MAX_PINS, usePins } from '@/src/hooks/usePins';
import { usePrefetch } from '@/src/hooks/usePrefetch';
import { useWorkspaces } from '@/src/hooks/useWorkspaces';
import { cn } from '@/src/lib/utils';
import type { Workspace } from '@/src/workspaceService';

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
      setPaletteOpen((open) => !open);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const shell = useMemo<Shell>(
    () => ({
      openPalette: () => setPaletteOpen(true),
      openInvite: (workspaceId) => setInviteWorkspace(workspaceId),
      openNewWorkspace: () => setNewWorkspaceOpen(true),
      openNavigation: () => setNavigationOpen(true),
      sidebarCollapsed: collapsed,
      toggleSidebar: documentOpen ? () => setRailExpanded((expanded) => !expanded) : undefined,
    }),
    [collapsed, documentOpen],
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
          <Sheet open={navigationOpen} onOpenChange={setNavigationOpen}>
            <SheetContent
              side="left"
              showCloseButton={false}
              className="w-[280px] max-w-[85vw] rounded-r-panel p-0"
            >
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Sidebar
                {...sidebar}
                onSearch={() => {
                  setNavigationOpen(false);
                  shell.openPalette();
                }}
                onNewWorkspace={() => {
                  setNavigationOpen(false);
                  shell.openNewWorkspace();
                }}
                onNavigate={() => setNavigationOpen(false)}
              />
            </SheetContent>
          </Sheet>
          <main className="flex min-w-0 flex-1 flex-col gap-3">
            <InvitationsProvider value={invitations}>
              <WorkspacePresenceProvider workspaceId={activeWorkspaceId} onSessionExpired={expire}>
                {children}
              </WorkspacePresenceProvider>
            </InvitationsProvider>
          </main>
        </div>
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onNewWorkspace={shell.openNewWorkspace}
          onInvite={shell.openInvite}
        />
        <NewWorkspaceDialog open={newWorkspaceOpen} onOpenChange={setNewWorkspaceOpen} />
        <InviteDialog workspaceId={inviteWorkspace} onClose={() => setInviteWorkspace(undefined)} />
        <Toaster />
      </TooltipProvider>
    </ShellProvider>
  );
}
