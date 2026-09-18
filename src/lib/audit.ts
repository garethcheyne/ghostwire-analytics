/*
 * Audit log: sign-ins, security changes and admin actions (who, what, when, from where).
 * Writing an entry never fails the action it records.
 */
import { uuid } from '@/lib/crypto';
import { getIpAddress } from '@/lib/ip';
import prisma from '@/lib/prisma';
import type { Auth } from '@/lib/types';

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string | null;
  websiteId?: string | null;
  teamId?: string | null;
  details?: Record<string, unknown>;
}

export interface AuditActor {
  id?: string | null;
  username?: string | null;
}

/** Keys whose values never belong in the log. */
const SECRET_KEYS = /password|secret|token|key$|^key|code|backup/i;

function scrub(details: Record<string, unknown> | undefined) {
  if (!details) return undefined;

  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      SECRET_KEYS.test(key) ? '[redacted]' : value,
    ]),
  );
}

export async function writeAudit(
  actor: AuditActor | null | undefined,
  entry: AuditEntry,
  headers?: Headers,
) {
  try {
    const ip = headers ? getIpAddress(headers) : undefined;

    await prisma.client.auditLog.create({
      data: {
        id: uuid(),
        userId: actor?.id ?? null,
        username: actor?.username?.slice(0, 255) ?? null,
        action: entry.action.slice(0, 60),
        targetType: entry.targetType?.slice(0, 30) ?? null,
        targetId: entry.targetId ? String(entry.targetId).slice(0, 255) : null,
        websiteId: entry.websiteId ?? null,
        teamId: entry.teamId ?? null,
        details: (scrub(entry.details) as object) ?? undefined,
        ip: ip ? String(ip).slice(0, 64) : null,
      },
    });
  } catch (e) {
    console.error('Failed to write audit log:', e);
  }
}

/** Records an action done through the API by the signed-in user (or API key). */
export function audit(request: Request, auth: Auth | null | undefined, entry: AuditEntry) {
  return writeAudit(
    auth?.user ? { id: auth.user.id, username: auth.user.username } : null,
    entry,
    request.headers,
  );
}
