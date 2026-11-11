import { authenticate } from './documentsProxy';
import { fetchUpstream, relay, serviceUnavailable, workspaceBase } from './upstream';

/** Authenticates the session and relays the call; the Workspace Service enforces access rules. */
export async function forwardToWorkspaces(request: Request, path: string): Promise<Response> {
  const auth = await authenticate(request);
  if ('error' in auth) return auth.error;
  const hasBody = request.method === 'POST' || request.method === 'PATCH';
  try {
    return relay(
      await fetchUpstream(`${workspaceBase}${path}`, {
        method: request.method,
        headers: {
          Authorization: auth.authorization,
          ...(hasBody && { 'Content-Type': 'application/json' }),
        },
        ...(hasBody && { body: await request.text() }),
      }),
    );
  } catch {
    return serviceUnavailable('Workspace Service');
  }
}
