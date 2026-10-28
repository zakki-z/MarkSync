/** Server-side API adapters. The browser only communicates with same-origin /api routes. */
export const authBase = (process.env.AUTH_SERVICE_URL ?? 'http://localhost:8000').replace(/\/$/, '');
export const documentBase = (process.env.DOCUMENT_SERVICE_URL ?? 'http://localhost:8082').replace(/\/$/, '');

export async function fetchUpstream(url: string, init?: RequestInit): Promise<Response> {
  const timeout = AbortSignal.timeout(10_000);
  return fetch(url, {
    ...init,
    cache: 'no-store',
    signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  });
}

export async function relay(response: Response): Promise<Response> {
  const contentType = response.headers.get('content-type') ?? 'application/json';
  return new Response(response.status === 204 ? null : await response.text(), {
    status: response.status,
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
  });
}

export function serviceUnavailable(service: string): Response {
  return Response.json(
    { detail: `${service} is unavailable. Check that it is running and the frontend environment is configured.` },
    { status: 502 },
  );
}
