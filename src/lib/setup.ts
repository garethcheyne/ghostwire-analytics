import { log } from '@/lib/logger';
import { auth } from '@/lib/better-auth';
import { ROLES } from '@/lib/auth-roles';
import { prisma } from '@/lib/prisma';

/**
 * Creates the first admin account if the database has no users yet (Umami seeds admin/umami).
 *
 *   ADMIN_USERNAME  default: admin
 *   ADMIN_EMAIL     default: admin@ghostwire.local
 *   ADMIN_PASSWORD  default: ghostwire  (change it after first login)
 */
export async function ensureAdminUser() {
  if ((await prisma.user.count()) > 0) {
    return false;
  }

  const username = process.env.ADMIN_USERNAME || 'admin';
  const email = process.env.ADMIN_EMAIL || 'admin@ghostwire.local';
  const password = process.env.ADMIN_PASSWORD || 'ghostwire';

  await auth.api.createUser({
    body: { email, password, name: username, role: ROLES.admin, data: { username } },
  });

  log.info('setup.admin_created', {
    username,
    message: 'Change its password after signing in.',
  });
  if (!process.env.ADMIN_PASSWORD) {
    log.warn('setup.default_password', {
      message: `The admin account uses the default password. Sign in as "${username}" and change it now.`,
    });
  }

  return true;
}
