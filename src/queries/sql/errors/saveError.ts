import { uuid } from '@/lib/crypto';
import {
  type ErrorPlatform,
  type ErrorSource,
  getCulprit,
  getFingerprint,
  parseStack,
  type StackFrame,
} from '@/lib/errors';
import prisma from '@/lib/prisma';

const FUNCTION_NAME = 'saveError';

// Caps so one noisy report can't bloat a row.
const MAX_STACK = 20_000;
const MAX_CONTEXT = 16_000;

export interface SaveErrorArgs {
  websiteId: string;
  source: ErrorSource;
  platform: ErrorPlatform;
  type: string;
  message: string;
  stack?: string | null;
  /** Pre-parsed frames (server clients may send them); otherwise parsed from the stack. */
  frames?: StackFrame[];
  sessionId?: string | null;
  visitId?: string | null;
  distinctId?: string | null;
  hostname?: string | null;
  urlPath?: string | null;
  browser?: string | null;
  os?: string | null;
  device?: string | null;
  environment?: string | null;
  release?: string | null;
  context?: Record<string, unknown> | null;
  createdAt?: Date;
}

const cut = (value: string | null | undefined, max: number) => (value ? value.slice(0, max) : null);

function limitContext(context: Record<string, unknown> | null | undefined) {
  if (!context) return null;

  const json = JSON.stringify(context);
  if (json.length <= MAX_CONTEXT) return json;

  // Too big: keep the most recent breadcrumbs and drop free-form extras.
  const { breadcrumbs, extra: _extra, ...rest } = context as Record<string, any>;
  const trimmed = {
    ...rest,
    breadcrumbs: Array.isArray(breadcrumbs) ? breadcrumbs.slice(-10) : undefined,
    truncated: true,
  };
  const trimmedJson = JSON.stringify(trimmed);

  return trimmedJson.length <= MAX_CONTEXT ? trimmedJson : JSON.stringify({ truncated: true });
}

/**
 * Stores one error occurrence and adds it to its group (creating the group the first time).
 * A resolved group that gets a new occurrence is reopened and marked as regressed; ignored
 * groups stay ignored.
 */
export async function saveError(args: SaveErrorArgs) {
  const { writeRawQuery } = prisma;
  const createdAt = args.createdAt ?? new Date();
  const type = cut(args.type, 200) || 'Error';
  const message = cut(args.message, 1000) || '(no message)';
  const frames = args.frames?.length ? args.frames : parseStack(args.stack, args.platform);
  const fingerprint = getFingerprint(type, message, frames);

  const [group] = await writeRawQuery(
    `
    insert into error_group (
      error_group_id, website_id, fingerprint, source, platform, type, message, culprit,
      status, count, first_seen, last_seen, created_at, updated_at
    )
    values (
      {{id::uuid}}, {{websiteId::uuid}}, {{fingerprint}}, {{source}}, {{platform}}, {{type}},
      {{message}}, {{culprit}}, 'open', 1, {{createdAt}}, {{createdAt}}, now(), now()
    )
    on conflict (website_id, fingerprint) do update set
      count = error_group.count + 1,
      last_seen = greatest(error_group.last_seen, excluded.last_seen),
      regressed_at = case when error_group.status = 'resolved' then now() else error_group.regressed_at end,
      status = case when error_group.status = 'resolved' then 'open' else error_group.status end,
      updated_at = now()
    returning error_group_id as "id"
    `,
    {
      id: uuid(),
      websiteId: args.websiteId,
      fingerprint,
      source: args.source,
      platform: args.platform,
      type,
      message,
      culprit: cut(getCulprit(frames), 500),
      createdAt,
    },
    FUNCTION_NAME,
  );

  await writeRawQuery(
    `
    insert into error_event (
      error_event_id, website_id, error_group_id, session_id, visit_id, distinct_id, source,
      platform, type, message, stack, frames, hostname, url_path, browser, os, device,
      environment, release, context, created_at
    )
    values (
      {{id::uuid}}, {{websiteId::uuid}}, {{groupId::uuid}}, {{sessionId::uuid}}, {{visitId::uuid}},
      {{distinctId}}, {{source}}, {{platform}}, {{type}}, {{message}}, {{stack}}, {{frames::jsonb}},
      {{hostname}}, {{urlPath}}, {{browser}}, {{os}}, {{device}}, {{environment}}, {{release}},
      {{context::jsonb}}, {{createdAt}}
    )
    `,
    {
      id: uuid(),
      websiteId: args.websiteId,
      groupId: group.id,
      sessionId: args.sessionId ?? null,
      visitId: args.visitId ?? null,
      distinctId: cut(args.distinctId, 50),
      source: args.source,
      platform: args.platform,
      type,
      message,
      stack: cut(args.stack, MAX_STACK),
      frames: frames.length ? JSON.stringify(frames) : null,
      hostname: cut(args.hostname, 100),
      urlPath: cut(args.urlPath, 500),
      browser: cut(args.browser, 20),
      os: cut(args.os, 20),
      device: cut(args.device, 20),
      environment: cut(args.environment, 50),
      release: cut(args.release, 100),
      context: limitContext(args.context),
      createdAt,
    },
    FUNCTION_NAME,
  );

  return { groupId: group.id as string, fingerprint };
}
