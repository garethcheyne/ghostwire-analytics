import { apiKey } from '@better-auth/api-key';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { admin, organization, twoFactor, username } from 'better-auth/plugins';
import { ROLES, TEAM_ROLES, teamAc, teamRoles, userAc, userRoles } from '@/lib/auth-roles';
import { API_KEY_PREFIX } from '@/lib/constants';
import prisma from '@/lib/prisma';

export const APP_NAME = 'Ghostwire Analytics';


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
    // Must be last so cookies set by server actions reach the browser.
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
