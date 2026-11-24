import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from './src/server/documentsProxy';
import { sessionCookie } from './src/server/session';
import { signInPath } from './src/auth/authState';

export async function proxy(request: NextRequest) {
  const auth = await authenticate(request);
  if ('error' in auth) {
    if (auth.error.status !== 401) return auth.error;
    const { pathname, search } = request.nextUrl;
    const response = NextResponse.redirect(new URL(signInPath(pathname + search), request.url));
    response.headers.set('Set-Cookie', sessionCookie('', 0));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

// The workspace dashboard needs a session. Document pages (/w/:id/d/:id) stay open so that public
// documents can be read anonymously; the Document Service decides what each visitor may see.
export const config = {
  matcher: [
    '/documents/:path*',
    '/invitations',
    '/w/:workspaceId',
    '/w/:workspaceId/members',
    '/w/:workspaceId/invitations',
  ],
};
