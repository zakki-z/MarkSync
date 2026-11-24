/**
 * Query keys for server state. Workspace-scoped keys start with ['workspaces', id], so one
 * invalidation of ['workspaces'] reaches everything that belongs to a workspace.
 */
export const queryKeys = {
  me: ['me'] as const,
  workspaces: ['workspaces'] as const,
  myInvitations: ['invitations', 'mine'] as const,
  membership: (workspaceId: number) => ['workspaces', workspaceId, 'membership'] as const,
  members: (workspaceId: number) => ['workspaces', workspaceId, 'members'] as const,
  /** `listed` is part of the key: only owners may list, and other roles get an empty list. */
  workspaceInvitations: (workspaceId: number, listed: boolean) =>
    ['workspaces', workspaceId, 'invitations', listed] as const,
  documents: (workspaceId: number) => ['workspaces', workspaceId, 'documents'] as const,
  document: (id: number) => ['documents', id] as const,
};

/**
 * How long a cached answer is served without asking the server again. Cached data is always shown
 * at once and revalidated in the background once it is older than this.
 */
export const staleTime = {
  session: 60_000,
  list: 30_000,
  document: 30_000,
  membership: 30_000,
} as const;
