import { apiRequest } from './apiClient';

export type Workspace = {
  id: number;
  name: string;
  visibility: 'PRIVATE' | 'PUBLIC';
  ownerId: string;
};

export const listWorkspaces = () => apiRequest<Workspace[]>('/api/workspaces');

export const createWorkspace = (name: string) =>
  apiRequest<Workspace>('/api/workspaces', { method: 'POST', data: { name } });
