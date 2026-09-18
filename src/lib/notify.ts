/*
 * Delivers a notification to one channel: Slack, Discord, Telegram, a generic webhook, email, or
 * push notifications to the owner's (or team's) devices.
 * Email needs SMTP_URL (e.g. smtp://user:pass@mail.example.com:587) and SMTP_FROM.
 */
import { createHmac } from 'node:crypto';

export type ChannelType = 'email' | 'slack' | 'discord' | 'telegram' | 'webhook' | 'push';

export const CHANNEL_TYPES: ChannelType[] = [
  'email',
  'slack',
  'discord',
  'telegram',
  'webhook',
  'push',
];

export interface ChannelConfig {
  url?: string;
  /** Webhooks: signs the body (X-Ghostwire-Signature: sha256=<hex HMAC>). Telegram: the bot token. */
  secret?: string;
  /** Telegram: the chat (user, group or channel) to post to. */
  chatId?: string;
  emails?: string[];
}

export interface Channel {
  id: string;
  type: string;
  name: string;
  config: ChannelConfig;
  /** Push channels reach this user's devices (personal channel) or the team's (team channel). */
  userId?: string | null;
  teamId?: string | null;
}

export interface Notification {
  /** Machine-readable kind, e.g. error.new; sent to webhooks as `event`. */
  event: string;
  title: string;
  text: string;
  /** Link back into Ghostwire Analytics. */
  url?: string;
  fields?: { name: string; value: string }[];
  /** 'danger' for errors, 'warning' for drops, 'info' otherwise. */
  level?: 'danger' | 'warning' | 'info';
  data?: Record<string, unknown>;
}

const TIMEOUT_MS = 10_000;
const COLORS = { danger: 0xef4444, warning: 0xf59e0b, info: 0x0ea5e9 };

export function isEmailConfigured() {
  return !!process.env.SMTP_URL && !!process.env.SMTP_FROM;
}

/** The app's public address, for links in notifications. */
export function appUrl(path = '') {
  const base = (process.env.APP_URL || process.env.BETTER_AUTH_URL || '').replace(/\/+$/, '');
  return base ? `${base}${process.env.BASE_PATH || ''}${path}` : undefined;
}

export function sign(body: string, secret: string) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

async function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  const payload = JSON.stringify(body);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: payload,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'error',
  });

  if (!response.ok) {
    // Services explain refusals in the body (Telegram: "Bad Request: chat not found").
    const detail = await response
      .json()
      .then(json => json?.description ?? json?.message ?? json?.error)
      .catch(() => null);
    throw new Error(
      [`${response.status} ${response.statusText}`.trim(), typeof detail === 'string' ? detail : '']
        .filter(Boolean)
        .join(': '),
    );
  }
}

function slackBody(n: Notification) {
  const lines = [`*${n.title}*`, n.text, ...(n.fields ?? []).map(f => `*${f.name}:* ${f.value}`)];
  if (n.url) lines.push(`<${n.url}|Open in Ghostwire Analytics>`);
  return { text: lines.filter(Boolean).join('\n') };
}

function discordBody(n: Notification) {
  return {
    embeds: [
      {
        title: n.title.slice(0, 256),
        description: n.text.slice(0, 4000),
        url: n.url,
        color: COLORS[n.level ?? 'info'],
        fields: (n.fields ?? []).slice(0, 25).map(f => ({
          name: f.name.slice(0, 256),
          value: f.value.slice(0, 1024) || '-',
          inline: true,
        })),
      },
    ],
  };
}

/** Telegram's HTML flavour: bold title, the text, fields, and a link (4096 characters at most). */
export function telegramBody(n: Notification, chatId: string) {
  const lines = [
    `<b>${escapeHtml(n.title)}</b>`,
    escapeHtml(n.text),
    ...(n.fields ?? []).map(f => `<b>${escapeHtml(f.name)}:</b> ${escapeHtml(f.value)}`),
    ...(n.url ? [`<a href="${escapeHtml(n.url)}">Open in Ghostwire Analytics</a>`] : []),
  ].filter(Boolean);

  let text = lines.join('\n');
  if (text.length > 4096) text = `${text.slice(0, 4000)}…`;

  return { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
}

function emailContent(n: Notification) {
  const fields = n.fields ?? [];
  const text = [
    n.text,
    '',
    ...fields.map(f => `${f.name}: ${f.value}`),
    ...(n.url ? ['', n.url] : []),
  ].join('\n');
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#0f172a">
<h2 style="font-size:16px;margin:0 0 8px">${escapeHtml(n.title)}</h2>
<p style="white-space:pre-wrap;margin:0 0 12px">${escapeHtml(n.text)}</p>
${fields.length ? `<table style="border-collapse:collapse;margin-bottom:12px">${fields.map(f => `<tr><td style="padding:2px 12px 2px 0;color:#64748b">${escapeHtml(f.name)}</td><td>${escapeHtml(f.value)}</td></tr>`).join('')}</table>` : ''}
${n.url ? `<a href="${escapeHtml(n.url)}" style="color:#0ea5e9">Open in Ghostwire Analytics</a>` : ''}
</div>`;
  return { text, html };
}

/** Sends email through SMTP_URL. Also used for reports. */
export async function sendEmail(
  to: string[],
  subject: string,
  content: { text: string; html: string },
) {
  if (!isEmailConfigured()) {
    throw new Error('Email is not set up on this server (SMTP_URL and SMTP_FROM).');
  }

  const { createTransport } = await import('nodemailer');
  const transport = createTransport(process.env.SMTP_URL);

  await transport.sendMail({ from: process.env.SMTP_FROM, to, subject, ...content });
}

export async function sendNotification(channel: Channel, notification: Notification) {
  const { config } = channel;

  switch (channel.type) {
    case 'slack':
      return post(config.url!, slackBody(notification));
    case 'discord':
      return post(config.url!, discordBody(notification));
    case 'telegram':
      return post(
        `https://api.telegram.org/bot${config.secret}/sendMessage`,
        telegramBody(notification, config.chatId!),
      );
    case 'webhook': {
      const body = {
        event: notification.event,
        title: notification.title,
        text: notification.text,
        url: notification.url,
        fields: notification.fields,
        data: notification.data,
        sentAt: new Date().toISOString(),
      };
      const headers: Record<string, string> = { 'user-agent': 'Ghostwire-Analytics' };
      if (config.secret)
        headers['x-ghostwire-signature'] = sign(JSON.stringify(body), config.secret);
      return post(config.url!, body, headers);
    }
    case 'email':
      return sendEmail(config.emails ?? [], notification.title, emailContent(notification));
    case 'push': {
      const { sendPushNotification } = await import('@/lib/push');
      await sendPushNotification(channel, notification);
      return;
    }
    default:
      throw new Error(`Unknown channel type: ${channel.type}`);
  }
}
