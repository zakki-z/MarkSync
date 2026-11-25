'use client';

import { createContext, useContext } from 'react';

/**
 * Actions the shell offers to everything inside it: overlays it owns (palette, invite dialog, new
 * workspace dialog, navigation drawer) and the sidebar mode. The value is memoised in AppShell and
 * only changes when the sidebar is collapsed or expanded.
 */
export type Shell = {
  openPalette: () => void;
  openInvite: (workspaceId: number) => void;
  openNewWorkspace: () => void;
  openNavigation: () => void;
  /** True on document pages while the sidebar is the icon rail. */
  sidebarCollapsed: boolean;
  /** Present only where the sidebar can collapse (document pages, wide screens). */
  toggleSidebar?: () => void;
};

const ShellContext = createContext<Shell | null>(null);

export const ShellProvider = ShellContext.Provider;

/** The shell's actions, or null outside the signed-in shell (public document pages). */
export function useShell(): Shell | null {
  return useContext(ShellContext);
}
