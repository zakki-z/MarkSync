import { NextResponse } from 'next/server';

export const SESSION_COOKIE = 'marksync_session';
const secure = process.env.COOKIE_SECURE === 'true';

export function sessionCookie(token: string, maxAge = 3600): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function sessionToken(request: Request): string | undefined {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}

export function unauthorized(): Response {
  return Response.json(
    { detail: 'Your session expired. Please log in again.' },
    {
      status: 401,
      headers: { 'Set-Cookie': sessionCookie('', 0), 'Cache-Control': 'no-store' },
    },
  );
}

export function mutationAllowed(request: Request): boolean {
  if (['GET', 'HEAD'].includes(request.method)) return true;
  const origins = (
    process.env.APP_ORIGINS ?? 'http://127.0.0.1:8080,http://localhost:8080,http://localhost:3000'
  ).split(',');
  return (
    origins.includes(request.headers.get('origin') ?? '') &&
    request.headers.get('sec-fetch-site') !== 'cross-site'
  );
}

export function forbidden(): Response {
  return NextResponse.json({ detail: 'Request origin is not allowed.' }, { status: 403 });
}
