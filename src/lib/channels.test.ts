import { describe, expect, it, vi } from 'vitest';

vi.mock('@/permissions', () => ({ canUpdateTeam: vi.fn(), canViewTeam: vi.fn() }));

const { channelSchema, serializeChannel } = await import('./channels');

const telegram = (config: Record<string, string>) =>
  channelSchema.safeParse({ type: 'telegram', name: 'Ops', config });

describe('notification channels', () => {
  it('accepts Telegram bot tokens and chat IDs', () => {
    const token = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';

    expect(telegram({ secret: token, chatId: '-1001234567890' }).success).toBe(true);
    expect(telegram({ secret: token, chatId: '@ghostwire_ops' }).success).toBe(true);
    // Editing without a new token keeps the stored one.
    expect(telegram({ chatId: '42' }).success).toBe(true);

    expect(telegram({ secret: 'not-a-token', chatId: '42' }).success).toBe(false);
    expect(telegram({ secret: token, chatId: 'ops chat' }).success).toBe(false);
  });

  it('never returns a bot token or webhook secret', () => {
    const channel = serializeChannel({
      id: 'c1',
      name: 'Ops',
      type: 'telegram',
      userId: 'u1',
      teamId: null,
      config: { secret: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw', chatId: '-100123' },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    expect(channel.config).toEqual({ chatId: '-100123', hasSecret: true });
    expect(JSON.stringify(channel)).not.toContain('AAHdq');
  });
});
