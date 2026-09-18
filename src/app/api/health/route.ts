import { log } from '@/lib/logger';
import prisma from '@/lib/prisma';

const startedAt = Date.now();

/**
 * Readiness for uptime monitors: 200 when the database answers, 503 when it doesn't.
 * (/api/heartbeat only says the process is up; the container healthcheck uses that.)
 */
export async function GET() {
  const began = Date.now();

  try {
    await prisma.client.$queryRaw`select 1`;

    return Response.json(
      {
        ok: true,
        database: { ok: true, ms: Date.now() - began },
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    log.error('health.database_unavailable', { error });

    return Response.json(
      { ok: false, database: { ok: false } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
