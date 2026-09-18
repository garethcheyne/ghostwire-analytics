import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();

vi.mock('@/lib/prisma', () => ({ default: { client: { auditLog: { create } } } }));

const { audit, writeAudit } = await import('./audit');

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({});
});

describe('audit log', () => {
  it('records who did what from where, without secrets', async () => {
    await audit(
      new Request('https://gw.test/api/users', { headers: { 'x-forwarded-for': '203.0.113.5' } }),
      { user: { id: 'u1', username: 'admin', role: 'admin', isAdmin: true } },
      {
        action: 'user.create',
        targetType: 'user',
        targetId: 'u2',
        details: { username: 'jane', password: 'hunter22', apiKey: 'gwa_x', accessCode: 'c' },
      },
    );

    expect(create.mock.calls[0][0].data).toMatchObject({
      userId: 'u1',
      username: 'admin',
      action: 'user.create',
      targetType: 'user',
      targetId: 'u2',
      ip: '203.0.113.5',
      details: {
        username: 'jane',
        password: '[redacted]',
        apiKey: '[redacted]',
        accessCode: '[redacted]',
      },
    });
  });

  it('never fails the action it records', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    create.mockRejectedValue(new Error('db down'));

    await expect(writeAudit(null, { action: 'auth.sign-in.failed' })).resolves.toBeUndefined();
    error.mockRestore();
  });
});
