/*
 * Single sign-on with any OpenID Connect provider (Authentik, Keycloak, Entra ID, Google...),
 * off unless configured:
 *   OIDC_DISCOVERY_URL   e.g. https://auth.example.com/application/o/ghostwire/.well-known/openid-configuration
 *   OIDC_CLIENT_ID, OIDC_CLIENT_SECRET
 *   OIDC_NAME            the button label (default "SSO")
 *   OIDC_AUTO_CREATE     "true" creates accounts on first sign-in; otherwise only existing users
 *                        (matched by email) can sign in
 * The provider's callback URL is <BETTER_AUTH_URL>/api/auth/callback/oidc.
 */

export const SSO_PROVIDER_ID = 'oidc';

export function getSsoConfig(env: Record<string, string | undefined> = process.env) {
  const discoveryUrl = env.OIDC_DISCOVERY_URL?.trim();
  const clientId = env.OIDC_CLIENT_ID?.trim();

  if (!discoveryUrl || !clientId) return null;

  return {
    discoveryUrl,
    clientId,
    clientSecret: env.OIDC_CLIENT_SECRET?.trim() || undefined,
    name: env.OIDC_NAME?.trim() || 'SSO',
    autoCreate: env.OIDC_AUTO_CREATE === 'true',
  };
}

/** A username for a new SSO user: their preferred username, else the email's local part. */
export function usernameFromProfile(profile: { preferred_username?: unknown; email?: unknown }) {
  const source =
    (typeof profile.preferred_username === 'string' && profile.preferred_username) ||
    (typeof profile.email === 'string' && profile.email.split('@')[0]) ||
    '';

  // Better Auth's username rules: letters, numbers, _ and . (3 to 30 characters).
  const username = source
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 30);
  return username.length >= 3 ? username : undefined;
}
