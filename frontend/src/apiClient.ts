export class ApiError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when the request never got a response (offline, connection reset). */
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type ApiRequestOptions = { method?: Method; data?: unknown };

/**
 * Decides what a 401 means. Resolve `true` when the session was recovered and the request should
 * be retried; `false` when the user is signed out. Today the session cannot be renewed (the auth
 * service issues no refresh token), so the app's handler marks the session as ended.
 */
export type UnauthorizedHandler = () => boolean | Promise<boolean>;

const signedOut: UnauthorizedHandler = () => false;
let unauthorizedHandler: UnauthorizedHandler = signedOut;
let recovery: Promise<boolean> | undefined;

/** Installs the 401 handler and returns a function that removes it. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler): () => void {
  unauthorizedHandler = handler;
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = signedOut;
  };
}

/** Single flight: requests that get a 401 at the same time share one call to the handler. */
function recoverSession(): Promise<boolean> {
  recovery ??= Promise.resolve()
    .then(unauthorizedHandler)
    .catch(() => false)
    .finally(() => {
      recovery = undefined;
    });
  return recovery;
}

/** Statuses worth one automatic retry on a read: no response, or a gateway that blinked. */
const TRANSIENT = new Set([0, 502, 503, 504]);
export const TRANSIENT_RETRY_DELAY_MS = 400;

async function send(path: string, options: ApiRequestOptions): Promise<Response> {
  try {
    return await fetch(path, {
      method: options.method ?? 'GET',
      headers: options.data ? { 'Content-Type': 'application/json' } : {},
      body: options.data ? JSON.stringify(options.data) : undefined,
      cache: 'no-store',
    });
  } catch {
    return new Response(null, { status: 599 });
  }
}

async function toError(response: Response): Promise<ApiError> {
  if (response.status === 599) {
    return new ApiError('Unable to reach MarkSync. Check your connection.', 0);
  }
  const error: unknown = await response.json().catch(() => null);
  const issue = error as { detail?: string; message?: string; title?: string } | null;
  return new ApiError(
    issue?.detail ?? issue?.message ?? issue?.title ?? `Request failed (${response.status})`,
    response.status,
  );
}

/**
 * Calls a same-origin /api route and turns problem responses into ApiError. A 401 goes through
 * the shared unauthorized handler and the request is retried once if the session was recovered.
 * A read that fails transiently is retried once before the error reaches the UI.
 *
 * It has no React dependency, so it can serve directly as a query function.
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const read = (options.method ?? 'GET') === 'GET';
  let response = await send(path, options);
  let error = response.ok ? undefined : await toError(response);

  if (error && read && TRANSIENT.has(error.status)) {
    await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS));
    response = await send(path, options);
    error = response.ok ? undefined : await toError(response);
  }
  if (error?.status === 401 && (await recoverSession())) {
    response = await send(path, options);
    error = response.ok ? undefined : await toError(response);
  }

  if (error) throw error;
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
