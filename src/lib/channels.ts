/*
 * Notification channels: validation, access and the shape returned by the API. Secrets (webhook
 * signing secrets, Telegram bot tokens, both kept in config.secret) are never sent back, only
 * whether one is set.
 */
import { z } from 'zod';
import type { NotificationChannel } from '@/generated/prisma/client';
import type { Auth } from '@/lib/types';
import { canUpdateTeam, canViewTeam } from '@/permissions';

const httpUrl = z
  .string()
  .trim()
  .max(1000)
  .refine(value => /^https?:\/\//i.test(value), 'Must be an http(s) URL.');

export const channelSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('email'),
    name: z.string().trim().min(1).max(100),
    config: z.object({ emails: z.array(z.string().trim().email()).min(1).max(10) }),
  }),
  z.object({
    type: z.enum(['slack', 'discord']),
    name: z.string().trim().min(1).max(100),
    config: z.object({ url: httpUrl }),
  }),
  z.object({
    type: z.literal('webhook'),
    name: z.string().trim().min(1).max(100),
    config: z.object({ url: httpUrl, secret: z.string().max(200).optional() }),
  }),
  z.object({
    type: z.literal('telegram'),
    name: z.string().trim().min(1).max(100),
    config: z.object({
      /** The bot token from @BotFather. Optional only when editing (the current one is kept). */
      secret: z
        .string()
        .trim()
        .regex(/^\d+:[\w-]{30,}$/, 'That is not a bot token (it looks like 123456:ABC-DEF...).')
        .optional(),
      /** A chat ID (e.g. -1001234567890) or a public channel's @username. */
      chatId: z
        .string()
        .trim()
        .regex(/^(-?\d{1,20}|@\w{5,32})$/, 'Use a numeric chat ID or @channelname.'),
    }),
  }),
  z.object({
    /** Push notifications to the owner's devices, or every team member's for a team channel. */
    type: z.literal('push'),
    name: z.string().trim().min(1).max(100),
    config: z.object({}).default({}),
  }),
]);

/** Channel types whose secret is kept when an edit leaves it blank. */
export const SECRET_CHANNEL_TYPES = ['webhook', 'telegram'];

export type ChannelInput = z.infer<typeof channelSchema>;

export function serializeChannel(channel: NotificationChannel) {
  const { secret, ...config } = (channel.config ?? {}) as Record<string, unknown>;

  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    userId: channel.userId,
    teamId: channel.teamId,
    config: { ...config, hasSecret: !!secret },
    createdAt: channel.createdAt,
  };
}

/** Owners of personal channels, and team managers for team channels. */
export async function canManageChannel(auth: Auth, channel: NotificationChannel) {
  if (!auth.user) return false;
  if (auth.user.isAdmin || channel.userId === auth.user.id) return true;
  return !!channel.teamId && !!(await canUpdateTeam(auth, channel.teamId));
}

/** Channels someone may send a website's alerts to: their own, and the website's team's. */
export async function canUseChannel(
  auth: Auth,
  channel: NotificationChannel,
  websiteTeamId: string | null,
) {
  if (!auth.user) return false;
  if (auth.user.isAdmin || channel.userId === auth.user.id) return true;
  return (
    !!channel.teamId &&
    channel.teamId === websiteTeamId &&
    !!(await canViewTeam(auth, channel.teamId))
  );
}
