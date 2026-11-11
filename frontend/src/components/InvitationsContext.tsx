'use client';

import { createContext, useContext } from 'react';
import type { useMyInvitations } from '@/src/hooks/useMyInvitations';

type MyInvitations = ReturnType<typeof useMyInvitations>;

/** Lets the navigation badge and the invitations page share one list, so they never disagree. */
const InvitationsContext = createContext<MyInvitations | null>(null);

export const InvitationsProvider = InvitationsContext.Provider;

export function useSharedInvitations(): MyInvitations {
  const value = useContext(InvitationsContext);
  if (!value) throw new Error('useSharedInvitations must be used inside AppShell');
  return value;
}
