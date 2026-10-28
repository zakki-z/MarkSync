export type DocumentDTO = {
  id: number;
  title: string;
  authorId: string;
  markdown: string;
  createdAt: string;
  updatedAt: string;
};

export type DocumentDraft = {
  title: string;
  markdown: string;
};

export class DocumentApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'DocumentApiError';
  }
}

async function documentRequest<T>(
  path: string,
  token: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; data?: DocumentDraft } = {},
): Promise<T> {
  const response = await fetch(`/api/documents${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.data ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.data ? JSON.stringify(options.data) : undefined,
    cache: 'no-store',
  });

  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null);
    const issue = error as { detail?: string; message?: string; title?: string } | null;
    throw new DocumentApiError(
      issue?.detail ?? issue?.message ?? issue?.title ?? `Document request failed (${response.status})`,
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const listDocuments = (token: string) =>
  documentRequest<DocumentDTO[]>('', token);

export const getDocument = (token: string, id: number) =>
  documentRequest<DocumentDTO>(`/${id}`, token);

export const createDocument = (token: string, data: DocumentDraft) =>
  documentRequest<DocumentDTO>('', token, { method: 'POST', data });

export const updateDocument = (token: string, id: number, data: DocumentDraft) =>
  documentRequest<DocumentDTO>(`/${id}`, token, { method: 'PUT', data });

export const deleteDocument = (token: string, id: number) =>
  documentRequest<void>(`/${id}`, token, { method: 'DELETE' });
