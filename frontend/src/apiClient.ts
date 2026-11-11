export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Calls a same-origin /api route and turns problem responses into ApiError. */
export async function apiRequest<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; data?: unknown } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers: options.data ? { 'Content-Type': 'application/json' } : {},
    body: options.data ? JSON.stringify(options.data) : undefined,
    cache: 'no-store',
  });

  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null);
    const issue = error as { detail?: string; message?: string; title?: string } | null;
    throw new ApiError(
      issue?.detail ?? issue?.message ?? issue?.title ?? `Request failed (${response.status})`,
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
