import { describe, expect, it } from 'vitest';
import { getSsoConfig, usernameFromProfile } from './sso';

describe('single sign-on', () => {
  it('is off unless a discovery URL and client ID are set', () => {
    expect(getSsoConfig({})).toBeNull();
    expect(getSsoConfig({ OIDC_CLIENT_ID: 'x' })).toBeNull();

    expect(
      getSsoConfig({
        OIDC_DISCOVERY_URL: 'https://auth.example.com/.well-known/openid-configuration',
        OIDC_CLIENT_ID: 'ghostwire',
        OIDC_CLIENT_SECRET: 's3',
      }),
    ).toEqual({
      discoveryUrl: 'https://auth.example.com/.well-known/openid-configuration',
      clientId: 'ghostwire',
      clientSecret: 's3',
      name: 'SSO',
      autoCreate: false,
    });

    expect(
      getSsoConfig({
        OIDC_DISCOVERY_URL: 'https://a/.well-known/openid-configuration',
        OIDC_CLIENT_ID: 'x',
        OIDC_NAME: 'Authentik',
        OIDC_AUTO_CREATE: 'true',
      }),
    ).toMatchObject({ name: 'Authentik', autoCreate: true });
  });

  it('makes usernames that Better Auth accepts', () => {
    expect(usernameFromProfile({ preferred_username: 'Jane.Doe' })).toBe('jane.doe');
    expect(usernameFromProfile({ email: 'jane-doe+ops@acme.io' })).toBe('jane_doeops');
    expect(usernameFromProfile({ preferred_username: 'ab' })).toBeUndefined();
    expect(usernameFromProfile({})).toBeUndefined();
  });
});
