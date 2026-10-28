import { authenticate } from '@/src/server/documentsProxy';
import { forbidden, mutationAllowed, sessionCookie } from '@/src/server/session';
import { authBase, fetchUpstream, serviceUnavailable } from '@/src/server/upstream';

type Context = { params: Promise<{ action: string }> };

export async function GET(request: Request, context: Context) {
  if ((await context.params).action !== 'me') return new Response(null, { status: 404 });
  const auth = await authenticate(request);
  return 'error' in auth
    ? auth.error
    : Response.json(auth.user, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request, context: Context) {
  if (!mutationAllowed(request)) return forbidden();
  const { action } = await context.params;
  if (action === 'logout') {
    return new Response(null, {
      status: 204,
      headers: { 'Set-Cookie': sessionCookie('', 0), 'Cache-Control': 'no-store' },
    });
  }
  if (action !== 'login' && action !== 'signup') return new Response(null, { status: 404 });
  let credentials: { email: string; password: string };
  try {
    const body: unknown = await request.json();
    if (
      !body ||
      typeof body !== 'object' ||
      !('email' in body) ||
      !('password' in body) ||
      typeof body.email !== 'string' ||
      typeof body.password !== 'string' ||
      body.email.length > 254 ||
      body.password.length > 128
    )
      throw new Error();
    credentials = { email: body.email.trim(), password: body.password };
  } catch {
    return Response.json(
      { detail: 'Enter a valid email and password (maximum 128 characters).' },
      { status: 400 },
    );
  }
  try {
    const upstream = await fetchUpstream(`${authBase}/auth/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    if (!upstream.ok) {
      // Never relay validation input, credentials, tokens, or upstream tracebacks.
      const detail =
        upstream.status === 401
          ? 'Incorrect email or password'
          : upstream.status === 400 || upstream.status === 409
            ? 'Email already registered'
            : upstream.status === 422
              ? 'Enter a valid email and a password of 8–128 characters.'
              : 'Authentication is temporarily unavailable. Please try again.';
      return Response.json({ detail }, { status: upstream.status >= 500 ? 502 : upstream.status });
    }
    if (action === 'signup') return Response.json({ message: 'Account created.' }, { status: 201 });
    const data = (await upstream.json()) as { access_token?: unknown };
    if (typeof data.access_token !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(data.access_token)) {
      return serviceUnavailable('Auth Service');
    }
    return Response.json(
      { message: 'Signed in.' },
      {
        headers: { 'Set-Cookie': sessionCookie(data.access_token), 'Cache-Control': 'no-store' },
      },
    );
  } catch {
    return serviceUnavailable('Auth Service');
  }
}
