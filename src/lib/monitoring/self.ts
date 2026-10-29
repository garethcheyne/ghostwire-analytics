/*
 * Self monitoring: one admin switch (Administration → Settings). When on, this Analytics instance
 * monitors itself into its own website, created the first time (named after the instance) and
 * remembered in app_setting, through the same ingest code as /v1/* but in process: no URL, no key,
 * no HTTP round trip. The OpenTelemetry side is src/lib/monitoring/self-telemetry.ts.
 */
import { hostname } from 'node:os';
import { uuid } from '@/lib/crypto';
import { prisma } from '@/lib/prisma';

export const SELF_MONITORING_KEY = 'self_monitoring';
export const SELF_WEBSITE_KEY = 'self_monitoring_website_id';

/** How long the switch is cached; a change applies within this. */
const CACHE_MS = 15_000;
const CACHE = Symbol.for('ghostwire.self-monitoring');

export interface SelfMonitoring {
  enabled: boolean;
  websiteId: string | null;
}

interface Cache {
  value: SelfMonitoring | null;
  readAt: number;
  pending: Promise<SelfMonitoring> | null;
}

function cache(): Cache {
  const store = globalThis as unknown as Record<symbol, Cache | undefined>;
  store[CACHE] ??= { value: null, readAt: 0, pending: null };
  return store[CACHE]!;
}

/** The instance's name for its own site: the host it is served on, else the machine. */
export function instanceName(env: Record<string, string | undefined> = process.env) {
  for (const url of [env.APP_URL, env.BETTER_AUTH_URL]) {
    try {
      if (url) return new URL(url).host;
    } catch {
      // not a URL; try the next
    }
  }
  return hostname();
}

/** Reads the switch and the site from the database (uncached). */
export async function readSelfMonitoring(): Promise<SelfMonitoring> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [SELF_MONITORING_KEY, SELF_WEBSITE_KEY] } },
  });
  const value = (key: string) => rows.find(r => r.key === key)?.value ?? null;
  const websiteId = value(SELF_WEBSITE_KEY);

  return { enabled: value(SELF_MONITORING_KEY) === 'true' && !!websiteId, websiteId };
}

/** The current setting, cached for CACHE_MS. Never throws (an unreadable setting counts as off). */
export function getSelfMonitoring(): Promise<SelfMonitoring> {
  const c = cache();
  if (c.value && Date.now() - c.readAt < CACHE_MS) return Promise.resolve(c.value);

  c.pending ??= readSelfMonitoring()
    .catch(() => ({ enabled: false, websiteId: null }))
    .then(value => {
      c.value = value;
      c.readAt = Date.now();
      c.pending = null;
      return value;
    });
  return c.pending;
}

/** The last value read, without waiting (for the synchronous sampler); refreshes in the background. */
export function peekSelfMonitoring(): SelfMonitoring | null {
  const c = cache();
  if (Date.now() - c.readAt >= CACHE_MS) void getSelfMonitoring();
  return c.value;
}

/** The instance's own website, created (owned by `userId`) if it doesn't exist or was deleted. */
export async function ensureSelfWebsite(userId: string) {
  const stored = await prisma.appSetting.findUnique({ where: { key: SELF_WEBSITE_KEY } });

  if (stored) {
    const existing = await prisma.website.findUnique({
      where: { id: stored.value },
      select: { id: true, name: true, deletedAt: true },
    });
    if (existing && !existing.deletedAt) return existing;
  }

  const website = await prisma.website.create({
    data: {
      id: uuid(),
      name: `Ghostwire Analytics (${instanceName()})`.slice(0, 100),
      userId,
      createdBy: userId,
      // Exceptions on its own spans are filed under the site's Errors.
      errorsEnabled: true,
    },
    select: { id: true, name: true, deletedAt: true },
  });

  await prisma.appSetting.upsert({
    where: { key: SELF_WEBSITE_KEY },
    create: { key: SELF_WEBSITE_KEY, value: website.id },
    update: { value: website.id },
  });

  return website;
}

/** Turns self monitoring on (creating the site if needed) or off; returns the new state. */
export async function setSelfMonitoring(enabled: boolean, userId: string) {
  const website = enabled ? await ensureSelfWebsite(userId) : null;

  await prisma.appSetting.upsert({
    where: { key: SELF_MONITORING_KEY },
    create: { key: SELF_MONITORING_KEY, value: String(enabled) },
    update: { value: String(enabled) },
  });

  // Apply in this process straight away (other containers within CACHE_MS).
  cache().readAt = 0;
  return { enabled, websiteId: website?.id ?? (await readSelfMonitoring()).websiteId };
}

/** For the settings page: the switch and the site's name. */
export async function describeSelfMonitoring() {
  const { enabled, websiteId } = await readSelfMonitoring();
  const website = websiteId
    ? await prisma.website.findUnique({ where: { id: websiteId }, select: { id: true, name: true, deletedAt: true } })
    : null;

  return {
    enabled,
    website: website && !website.deletedAt ? { id: website.id, name: website.name } : null,
    // Self monitoring needs the OpenTelemetry SDK, which OTEL_SDK_DISABLED=true keeps from starting.
    available: process.env.OTEL_SDK_DISABLED !== 'true',
  };
}
