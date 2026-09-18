import { getSessionCookie } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';
import { getContentSecurityPolicy } from '@/lib/csp';
import { matchesConfiguredPath } from '@/lib/match-configured-path';

/*
 * Runs on every request. Everything here reads the environment at runtime, so Docker settings
 * (TRACKER_SCRIPT_NAME, COLLECT_API_ENDPOINT, ALLOWED_FRAME_URLS...) apply without a rebuild.
 * Adapted from Umami's Docker proxy, plus the dashboard login redirect.
 */

const TRACKER_PATH = '/script.js';
const RECORDER_PATH = '/recorder.js';
const COLLECT_PATH = '/api/send';
const LOGIN_PATH = '/login';
const BASE_PATH = process.env.BASE_PATH || '';

const apiHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, POST, PUT',
  'Access-Control-Max-Age': process.env.CORS_MAX_AGE || '86400',
  'Cache-Control': 'no-cache',
};

const trackerHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=86400, must-revalidate',
};

// Paths reachable without a dashboard session.
const PUBLIC_PATHS = [/^\/login(\/|$)/, /^\/share\//, /^\/support\//, /^\/api\//, /^\/[qp]\//, /^\/_next\//];
const PUBLIC_FILES = /\.(js|css|png|ico|svg|jpg|jpeg|gif|webp|txt|xml|json|map|woff2?)$/;

const contentSecurityPolicy = getContentSecurityPolicy();

function customCollectEndpoint(request: NextRequest) {
  const collectEndpoint = process.env.COLLECT_API_ENDPOINT;

  if (collectEndpoint && matchesConfiguredPath(request.nextUrl.pathname, collectEndpoint, BASE_PATH)) {
    const url = request.nextUrl.clone();
    url.pathname = COLLECT_PATH;
    return NextResponse.rewrite(url, { headers: apiHeaders });
  }
}

function customScriptName(request: NextRequest) {
  const scriptName = process.env.TRACKER_SCRIPT_NAME;

  if (scriptName) {
    const names = scriptName.split(',').map(name => name.trim().replace(/^\/+/, ''));

    if (names.some(name => matchesConfiguredPath(request.nextUrl.pathname, name, BASE_PATH))) {
      const url = request.nextUrl.clone();
      url.pathname = TRACKER_PATH;
      return NextResponse.rewrite(url, { headers: trackerHeaders });
    }
  }
}

function customScriptUrl(request: NextRequest) {
  const scriptUrl = process.env.TRACKER_SCRIPT_URL;

  if (scriptUrl && matchesConfiguredPath(request.nextUrl.pathname, TRACKER_PATH, BASE_PATH)) {
    return NextResponse.rewrite(scriptUrl, { headers: trackerHeaders });
  }
}

function disableLogin(request: NextRequest) {
  if (
    process.env.DISABLE_LOGIN &&
    matchesConfiguredPath(request.nextUrl.pathname, LOGIN_PATH, BASE_PATH)
  ) {
    return new NextResponse('Access denied', { status: 403 });
  }
}

/** Optimistic redirect to /login for app pages; the real session check is in the (main) layout. */
function requireSession(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.some(re => re.test(pathname)) || PUBLIC_FILES.test(pathname)) {
    return;
  }

  if (!getSessionCookie(request)) {
    const url = new URL('/login', request.url);
    const next = pathname + search;

    if (next !== '/') {
      url.searchParams.set('next', next);
    }

    return NextResponse.redirect(url);
  }
}

export function proxy(request: NextRequest) {
  const handlers = [customCollectEndpoint, customScriptName, customScriptUrl, disableLogin, requireSession];

  let response: NextResponse | undefined;

  for (const handler of handlers) {
    response = handler(request);

    if (response) {
      break;
    }
  }

  response ??= NextResponse.next();

  const { pathname } = request.nextUrl;

  if (
    matchesConfiguredPath(pathname, TRACKER_PATH, BASE_PATH) ||
    matchesConfiguredPath(pathname, RECORDER_PATH, BASE_PATH)
  ) {
    Object.entries(trackerHeaders).forEach(([key, value]) => response.headers.set(key, value));
  }

  // Set here rather than only at build time so ALLOWED_FRAME_URLS resolves at runtime.
  response.headers.set('Content-Security-Policy', contentSecurityPolicy);

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
