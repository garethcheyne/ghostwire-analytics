import debug from 'debug';
import {
  API_KEY_PREFIX,
  ROLE_PERMISSIONS,
  ROLES,
  SHARE_CONTEXT_HEADER,
  SHARE_TOKEN_HEADER,
  SHARE_TOKEN_TYPE,
} from '@/lib/constants';
import { secret } from '@/lib/crypto';
import { parseToken } from '@/lib/jwt';
import prisma from '@/lib/prisma';
import { ensureArray } from '@/lib/utils';

/**
 * Request authentication for the API routes ported from Umami.
 *
 * Umami issued its own JWTs; here the identity comes from Better Auth. `checkAuth` returns the
 * same shape Umami's did, so every route and permission check works unchanged. It accepts:
 *   - the Better Auth session cookie (the dashboard),
 *   - `Authorization: Bearer gwa_...` API keys,
 *   - share tokens (`x-ghostwire-share-token`) on public share pages.
 */

const log = debug('ghostwire:auth');

// Loaded on demand so modules that only need hasPermission (permissions, tests) don't boot Better Auth.
const getAuth = async () => (await import('@/lib/better-auth')).auth;

// Routes that manage credentials or admin state must not be reachable with an API key.
const API_KEY_BLOCKED_PATHS = ['/api/auth', '/api/users', '/api/admin'];

export interface AuthUser {
  id: string;
  username: string | null;
  name: string;
  email: string;
  role: string;
  image: string | null;
  isAdmin: boolean;
}

export function getBearerToken(request: Request) {
  const header = request.headers.get('authorization');

  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

function isApiKeyBlockedPath(pathname: string) {
  return API_KEY_BLOCKED_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

async function loadUser(userId: string): Promise<AuthUser | null> {
  const user = await prisma.client.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      role: true,
      image: true,
      banned: true,
    },
  });

  if (!user || user.banned) {
    return null;
  }

  const role = user.role ?? ROLES.user;

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role,
    image: user.image,
    isAdmin: role === ROLES.admin,
  };
}

async function checkApiKeyAuth(request: Request, key: string) {
  const { pathname } = new URL(request.url);

  if (isApiKeyBlockedPath(pathname)) {
    log('API key not allowed for path', pathname);
    return null;
  }

  const auth = await getAuth();
  const result = await auth.api.verifyApiKey({ body: { key } });

  if (!result.valid || !result.key) {
    log('API key rejected', result.error?.message);
    return null;
  }

  const user = await loadUser(result.key.referenceId);

  if (!user) {
    log('API key user not found');
    return null;
  }

  return {
    token: key,
    user,
    authType: 'api-key' as const,
    apiKey: { id: result.key.id, name: result.key.name },
  };
}

export async function checkAuth(request: Request) {
  const token = getBearerToken(request);

  if (token?.startsWith(API_KEY_PREFIX)) {
    return checkApiKeyAuth(request, token);
  }

  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  const user = session ? await loadUser(session.user.id) : null;
  const shareToken = parseShareToken(request);

  log({ hasSession: !!session, hasShareToken: !!shareToken, userId: user?.id });

  if (!user && !shareToken) {
    log('User not authorized');
    return null;
  }

  if (!user && !request.headers.get(SHARE_CONTEXT_HEADER)) {
    log('Share token used outside share context');
    return null;
  }

  return {
    token,
    shareToken,
    user,
    authType: user ? ('session' as const) : ('share' as const),
  };
}

export async function hasPermission(role: string, permission: string | string[]) {
  return ensureArray(permission).some(e => ROLE_PERMISSIONS[role]?.includes(e));
}

export function parseShareToken(request: Request) {
  const header = request.headers.get(SHARE_TOKEN_HEADER);

  if (!header) {
    return null;
  }

  try {
    const token: any = parseToken(header, secret());

    // Only accept tokens explicitly minted as share tokens, so other tokens signed with the
    // same secret (e.g. the collect cache token) can't be replayed for analytics access.
    if (token?.type !== SHARE_TOKEN_TYPE) {
      return null;
    }

    return token;
  } catch (e) {
    log(e);
    return null;
  }
}
