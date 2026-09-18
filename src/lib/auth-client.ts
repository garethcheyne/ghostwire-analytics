'use client';
import { apiKeyClient } from '@better-auth/api-key/client';
import {
  adminClient,
  organizationClient,
  twoFactorClient,
  usernameClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { teamAc, teamRoles, userAc, userRoles } from '@/lib/auth-roles';

export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    adminClient({ ac: userAc, roles: userRoles }),
    organizationClient({ ac: teamAc, roles: teamRoles }),
    // The login form handles the two-factor redirect itself.
    twoFactorClient(),
    apiKeyClient(),
  ],
});

export const { useSession, signIn, signOut } = authClient;
