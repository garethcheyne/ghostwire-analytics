import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements as adminStatements } from 'better-auth/plugins/admin/access';
import { defaultStatements as orgStatements } from 'better-auth/plugins/organization/access';

/**
 * Roles and permissions, shared by the server auth config and the client.
 *
 * Global roles (admin plugin): admin, user, viewer.
 * Team roles (organization plugin): owner, manager, member, viewer. These mirror Umami's
 * team-owner / team-manager / team-member / team-view-only.
 */

export const ROLES = {
  admin: 'admin',
  user: 'user',
  viewer: 'viewer',
} as const;

export const TEAM_ROLES = {
  owner: 'owner',
  manager: 'manager',
  member: 'member',
  viewer: 'viewer',
} as const;

export const TEAM_ROLE_RANK: Record<string, number> = {
  [TEAM_ROLES.viewer]: 0,
  [TEAM_ROLES.member]: 1,
  [TEAM_ROLES.manager]: 2,
  [TEAM_ROLES.owner]: 3,
};

// Global (per-user) permissions.
export const userAc = createAccessControl({
  ...adminStatements,
  website: ['create', 'update', 'delete'],
  team: ['create'],
});

export const userRoles = {
  admin: userAc.newRole({
    ...adminStatements,
    website: ['create', 'update', 'delete'],
    team: ['create'],
  }),
  user: userAc.newRole({
    website: ['create', 'update', 'delete'],
    team: ['create'],
  }),
  viewer: userAc.newRole({
    website: [],
    team: [],
  }),
};

// Team (organization) permissions.
export const teamAc = createAccessControl({
  ...orgStatements,
  website: ['create', 'update', 'delete', 'transfer-to-team', 'transfer-to-user'],
});

export const teamRoles = {
  owner: teamAc.newRole({
    organization: ['update', 'delete'],
    member: ['create', 'update', 'delete'],
    invitation: ['create', 'cancel'],
    team: ['create', 'update', 'delete'],
    ac: ['create', 'read', 'update', 'delete'],
    website: ['create', 'update', 'delete', 'transfer-to-team', 'transfer-to-user'],
  }),
  manager: teamAc.newRole({
    organization: ['update'],
    member: ['create', 'update', 'delete'],
    invitation: ['create', 'cancel'],
    website: ['create', 'update', 'delete', 'transfer-to-team'],
  }),
  member: teamAc.newRole({
    website: ['create', 'update', 'delete'],
  }),
  viewer: teamAc.newRole({
    website: [],
  }),
};
