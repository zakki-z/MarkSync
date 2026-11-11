import { apiRequest } from './apiClient';

export type DocumentVisibility = 'PRIVATE' | 'PUBLIC';

export type DocumentDTO = {
  id: number;
  workspaceId: number;
  title: string;
  authorId: string;
  markdown: string;
  visibility: DocumentVisibility;
  /** Decided by the API; the UI only reflects it. */
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DocumentDraft = {
  title: string;
  markdown: string;
  visibility?: DocumentVisibility;
};

export const listDocuments = (workspaceId: number) =>
  apiRequest<DocumentDTO[]>(`/api/workspaces/${workspaceId}/documents`);

export const getDocument = (id: number) => apiRequest<DocumentDTO>(`/api/documents/${id}`);

export const createDocument = (workspaceId: number, data: DocumentDraft) =>
  apiRequest<DocumentDTO>(`/api/workspaces/${workspaceId}/documents`, { method: 'POST', data });

export const updateDocument = (id: number, data: DocumentDraft) =>
  apiRequest<DocumentDTO>(`/api/documents/${id}`, { method: 'PUT', data });

export const deleteDocument = (id: number) =>
  apiRequest<void>(`/api/documents/${id}`, { method: 'DELETE' });
