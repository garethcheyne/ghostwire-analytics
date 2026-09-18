import { describe, expect, it } from 'vitest';
import { ticketSummary } from './support-actions';

const user = {
  id: 'jane',
  sessions: [
    {
      id: 's1',
      browser: 'chrome',
      os: 'Windows 10',
      device: 'desktop',
      country: 'NZ',
      city: 'Auckland',
      firstAt: '2026-09-18T09:00:00Z',
      lastAt: '2026-09-19T10:31:00Z',
      visits: 2,
      views: 5,
      events: 1,
    },
  ],
  properties: [
    {
      dataKey: 'email',
      stringValue: 'jane@acme.io',
      numberValue: null,
      dateValue: null,
      dataType: 1,
      createdAt: '',
    },
    {
      dataKey: 'name',
      stringValue: 'Jane Doe',
      numberValue: null,
      dateValue: null,
      dataType: 1,
      createdAt: '',
    },
  ],
  activity: [
    {
      eventId: 'e3',
      sessionId: 's1',
      visitId: 'v2',
      createdAt: '2026-09-19T10:31:00Z',
      urlPath: '/checkout',
      eventType: 2,
      eventName: 'pay',
      referrerDomain: null,
      hostname: null,
    },
    {
      eventId: 'e2',
      sessionId: 's1',
      visitId: 'v2',
      createdAt: '2026-09-19T10:30:00Z',
      urlPath: '/cart',
      eventType: 1,
      eventName: null,
      referrerDomain: null,
      hostname: null,
    },
    {
      eventId: 'e1',
      sessionId: 's1',
      visitId: 'v1',
      createdAt: '2026-09-18T09:00:00Z',
      urlPath: '/',
      eventType: 1,
      eventName: null,
      referrerDomain: null,
      hostname: null,
    },
  ],
  errors: [
    {
      id: 'x1',
      groupId: 'g1',
      createdAt: '2026-09-19T10:31:05Z',
      sessionId: 's1',
      visitId: 'v2',
      type: 'TypeError',
      message: 'total is undefined',
      urlPath: '/checkout',
      source: 'browser' as const,
    },
  ],
  replays: [
    { id: 'v2', sessionId: 's1', startedAt: '', endedAt: '', duration: 65, eventCount: 10 },
  ],
};

describe('ticketSummary', () => {
  it('summarises who, the latest errors and the last visit with links', () => {
    const summary = ticketSummary(user as any, 'w1', 'https://gw.example.com');

    expect(summary).toContain('**User:** Jane Doe (jane)');
    expect(summary).toContain('**Email:** jane@acme.io');
    expect(summary).toContain(
      'TypeError: total is undefined (/checkout) https://gw.example.com/websites/w1/errors/g1',
    );
    // The last visit only, oldest action first.
    expect(summary).toMatch(/- \d\d:30:00 \/cart\n- \d\d:31:00 pay on \/checkout/);
    expect(summary).not.toContain('- 09:00');
    expect(summary).toContain('Replay: https://gw.example.com/websites/w1/replays/v2');
    expect(summary).toContain('Full timeline: https://gw.example.com/websites/w1/users/jane');
  });
});
