import { apiKey } from '@better-auth/api-key';
import { betterAuth } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { admin, genericOAuth, organization, twoFactor, username } from 'better-auth/plugins';
import { ROLES, TEAM_ROLES, teamAc, teamRoles, userAc, userRoles } from '@/lib/auth-roles';
import { writeAudit } from '@/lib/audit';
import { API_KEY_PREFIX } from '@/lib/constants';
import { getSsoConfig, SSO_PROVIDER_ID, usernameFromProfile } from '@/lib/sso';
import prisma from '@/lib/prisma';

export const APP_NAME = 'Ghostwire Analytics';

const sso = getSsoConfig();

/** Auth endpoints worth an audit entry, by path (prefix match for the admin/team families). */
const AUDITED: [RegExp, string][] = [
  [/^\/sign-in\//, 'auth.sign-in'],
  [/^\/callback\//, 'auth.sign-in.sso'],
  [/^\/two-factor\/verify-(totp|backup-code|otp)$/, 'auth.two-factor.verify'],
  [/^\/sign-out$/, 'auth.sign-out'],
  [/^\/change-password$/, 'auth.password.change'],
  [/^\/two-factor\/enable$/, 'auth.two-factor.enable'],
  [/^\/two-factor\/disable$/, 'auth.two-factor.disable'],
  [/^\/revoke-(session|sessions|other-sessions)$/, 'auth.session.revoke'],
  [/^\/api-key\/(create|delete|update)$/, 'api-key'],
  [
    /^\/admin\/(create-user|update-user|remove-user|set-role|set-user-password|ban-user|unban-user|impersonate-user|revoke-user-sessions)$/,
    'admin',
  ],
  [
    /^\/organization\/(create|delete|update|add-member|remove-member|update-member-role|leave)$/,
    'team',
  ],
];

/** Records auth activity in the audit log (after the endpoint ran, success or failure). */
const auditAuthActivity = createAuthMiddleware(async ctx => {
  // Starting SSO only redirects to the provider; the callback is the actual sign-in.
  if (ctx.path === '/sign-in/social') return;

  const match = AUDITED.find(([pattern]) => pattern.test(ctx.path));
  if (!match) return;

  const returned = ctx.context.returned as any;
  // Redirects are thrown as errors too; an SSO callback succeeded if it created a session.
  const failed = ctx.path.startsWith('/callback/')
    ? !ctx.context.newSession
    : returned instanceof Error || (returned && returned.statusCode >= 400);
  const base = match[1];
  const suffix = ['api-key', 'admin', 'team'].includes(base) ? `.${ctx.path.split('/').pop()}` : '';
  // A sign-in that only asks for the second factor isn't a sign-in yet.
  const pending = !failed && returned?.twoFactorRedirect;
  const action = `${base}${suffix}${failed ? '.failed' : pending ? '.second-factor' : ''}`;

  const user = ctx.context.newSession?.user ?? ctx.context.session?.user;
  const body = (ctx.body ?? {}) as Record<string, unknown>;

  // Only what identifies the target; never passwords, codes or keys.
  const details: Record<string, unknown> = {};
  for (const key of ['username', 'email', 'userId', 'role', 'name', 'organizationId', 'memberId']) {
    if (typeof body[key] === 'string') details[key] = body[key];
  }
  if (failed) {
    // A refused SSO callback redirects back with ?error=signup_disabled (and similar).
    let reason: string | null = null;
    try {
      const location = returned?.headers?.get?.('location');
      reason = location ? new URL(location, 'http://local').searchParams.get('error') : null;
    } catch {
      reason = null;
    }
    details.error = reason || returned?.message || returned?.body?.message;
  }

  await writeAudit(
    user ? { id: user.id, username: (user as any).username ?? user.email } : null,
    { action, details },
    ctx.headers ?? ctx.request?.headers,
  );
});

export const auth = betterAuth({
  appName: APP_NAME,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma.client, { provider: 'postgresql' }),
  advanced: {
    database: {
      // Umami's schema uses uuid columns for every user/team reference.
      generateId: 'uuid',
    },
  },
  emailAndPassword: {
    enabled: true,
    // No public sign-up. Admins create users, as in Umami.
    disableSignUp: true,
    minPasswordLength: 8,
  },
  // The analytics schema already has a `session` table (visitor sessions),
  // so login sessions live in `auth_session`.
  session: {
    modelName: 'authSession',
  },
  // SSO users sign in to their existing account when the provider's email matches and the
  // provider says it's verified (Ghostwire's own accounts are created by admins, unverified).
  account: {
    accountLinking: { enabled: true, requireLocalEmailVerified: false },
  },
  hooks: {
    after: auditAuthActivity,
  },
  user: {
    additionalFields: {
      twoFactorRequired: { type: 'boolean', defaultValue: false, input: false },
    },
  },
  plugins: [
    username(),
    admin({
      ac: userAc,
      roles: userRoles,
      defaultRole: ROLES.user,
      adminRoles: [ROLES.admin],
    }),
    organization({
      ac: teamAc,
      roles: teamRoles,
      creatorRole: TEAM_ROLES.owner,
      // No mail server: members are added directly or join with an access code.
      schema: {
        organization: {
          additionalFields: {
            accessCode: { type: 'string', required: false, unique: true, input: false },
            twoFactorRequired: { type: 'boolean', defaultValue: false, input: false },
          },
        },
      },
    }),
    twoFactor({
      issuer: APP_NAME,
    }),
    apiKey({
      defaultPrefix: API_KEY_PREFIX,
      apiKeyHeaders: 'authorization',
      customAPIKeyGetter: ctx => {
        const header = ctx.headers?.get('authorization');
        const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

        return token?.startsWith(API_KEY_PREFIX) ? token : null;
      },
      // Umami had no per-key limits; the plugin default is 10 requests per day.
      rateLimit: { enabled: false },
    }),
    ...(sso
      ? [
          genericOAuth({
            config: [
              {
                providerId: SSO_PROVIDER_ID,
                name: sso.name,
                discoveryUrl: sso.discoveryUrl,
                clientId: sso.clientId,
                clientSecret: sso.clientSecret,
                scopes: ['openid', 'profile', 'email'],
                // Only people who already have an account, unless OIDC_AUTO_CREATE is on.
                disableSignUp: !sso.autoCreate,
                mapProfileToUser: profile => ({
                  username: usernameFromProfile(profile),
                }),
              },
            ],
          }),
        ]
      : []),
    // Must be last so cookies set by server actions reach the browser.
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
