import { getSessionCookie } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Optimistic auth redirect for app pages: only checks that a session cookie exists.
 * The real session check happens in the (main) layout and in every API route.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL('/login', request.url);
    const next = request.nextUrl.pathname + request.nextUrl.search;

    if (next !== '/') {
      url.searchParams.set('next', next);
    }

    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except auth pages, public share pages, the API, link/pixel redirects,
  // tracker scripts and static files.
  matcher: [
    '/((?!login|share|api|q/|p/|_next/static|_next/image|script\\.js|recorder\\.js|favicon|apple-touch-icon|logo).*)',
  ],
};
