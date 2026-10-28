import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from './src/server/documentsProxy';
import { sessionCookie } from './src/server/session';

export async function proxy(request: NextRequest) {
  const auth = await authenticate(request);
  if ('error' in auth) {
    if (auth.error.status !== 401) return auth.error;
    const response = NextResponse.redirect(new URL('/auth', request.url));
    response.headers.set('Set-Cookie', sessionCookie('', 0));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: '/documents/:path*' };
