/**
 * Creates the first admin account if there are no users. The app also does this on startup
 * (src/instrumentation.ts); this script is for doing it without starting the server.
 */
import { config } from 'dotenv';

config({ path: ['.env.local', '.env'], quiet: true });

const { ensureAdminUser } = await import('../src/lib/setup');
const { prisma } = await import('../src/lib/prisma');

try {
  if (!(await ensureAdminUser())) {
    console.log('Users already exist, skipping admin creation.');
  }
} finally {
  await prisma.$disconnect();
}
