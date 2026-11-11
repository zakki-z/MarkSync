import type { Role } from '@/src/workspaceService';

const LABELS: Record<Role, string> = { OWNER: 'Owner', EDITOR: 'Editor', VIEWER: 'Viewer' };

export const roleLabel = (role: Role) => LABELS[role];
export const ROLES: Role[] = ['OWNER', 'EDITOR', 'VIEWER'];
