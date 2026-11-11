import { apiRequest } from './apiClient';

export type Workspace = {
  id: number;
  name: string;
  visibility: 'PRIVATE' | 'PUBLIC';
  ownerId: string;
};

export type Role = 'OWNER' | 'EDITOR' | 'VIEWER';

/** The caller's role and what it allows; the API decides, the UI only reads these flags. */
export type Membership = {
  role: Role;
  canEdit: boolean;
  canManageMembers: boolean;
  canManageWorkspace: boolean;
};

export type Member = {
  userId: string;
  username: string | null;
  role: Role;
  joinedAt: string;
};

export type Invitation = {
  id: number;
  workspaceId: number;
  workspaceName: string;
  invitedUserId: string;
  invitedUsername: string | null;
  invitedEmail: string | null;
  role: Role;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED';
  invitedBy: string;
  invitedByUsername: string | null;
  createdAt: string;
  expiresAt: string;
};

const workspacePath = (workspaceId: number) => `/api/workspaces/${workspaceId}`;

export const listWorkspaces = () => apiRequest<Workspace[]>('/api/workspaces');

export const createWorkspace = (name: string) =>
  apiRequest<Workspace>('/api/workspaces', { method: 'POST', data: { name } });

export const getMembership = (workspaceId: number) =>
  apiRequest<Membership>(`${workspacePath(workspaceId)}/membership`);

export const leaveWorkspace = (workspaceId: number) =>
  apiRequest<void>(`${workspacePath(workspaceId)}/membership`, { method: 'DELETE' });

export const listMembers = (workspaceId: number) =>
  apiRequest<Member[]>(`${workspacePath(workspaceId)}/members`);

export const changeMemberRole = (workspaceId: number, userId: string, role: Role) =>
  apiRequest<Member>(`${workspacePath(workspaceId)}/members/${userId}`, {
    method: 'PATCH',
    data: { role },
  });

export const removeMember = (workspaceId: number, userId: string) =>
  apiRequest<void>(`${workspacePath(workspaceId)}/members/${userId}`, { method: 'DELETE' });

export const listWorkspaceInvitations = (workspaceId: number) =>
  apiRequest<Invitation[]>(`${workspacePath(workspaceId)}/invitations`);

export const sendInvitation = (workspaceId: number, identifier: string, role: Role) =>
  apiRequest<Invitation>(`${workspacePath(workspaceId)}/invitations`, {
    method: 'POST',
    data: { identifier, role },
  });

export const revokeInvitation = (workspaceId: number, invitationId: number) =>
  apiRequest<void>(`${workspacePath(workspaceId)}/invitations/${invitationId}`, {
    method: 'DELETE',
  });

export const listMyInvitations = () => apiRequest<Invitation[]>('/api/invitations');

export const acceptInvitation = (invitationId: number) =>
  apiRequest<Invitation>(`/api/invitations/${invitationId}/accept`, { method: 'POST' });

export const declineInvitation = (invitationId: number) =>
  apiRequest<Invitation>(`/api/invitations/${invitationId}/decline`, { method: 'POST' });
