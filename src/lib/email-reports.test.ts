import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ default: { client: {} } }));
vi.mock('@/queries/sql', () => ({ getPageviewMetrics: vi.fn(), getWebsiteStats: vi.fn() }));
vi.mock('@/queries/sql/errors/getErrors', () => ({ getErrorStats: vi.fn() }));

const { isReportDue, renderReport, reportPeriod } = await import('./email-reports');

describe('email reports', () => {
  it('covers the last 7 full days, or the last calendar month', () => {
    const monday = new Date('2026-09-21T08:00:00Z');

    const week = reportPeriod('weekly', monday);
    expect(week.startDate.toISOString()).toBe('2026-09-14T00:00:00.000Z');
    expect(week.endDate.toISOString()).toBe('2026-09-20T23:59:59.999Z');
    expect(week.previousStart.toISOString()).toBe('2026-09-07T00:00:00.000Z');

    const month = reportPeriod('monthly', new Date('2026-10-01T08:00:00Z'));
    expect(month.startDate.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(month.endDate.toISOString()).toBe('2026-09-30T23:59:59.999Z');
  });

  it('is due Monday mornings for weekly and the 1st for monthly, once', () => {
    const monday = new Date('2026-09-21T08:00:00Z');

    expect(isReportDue('weekly', null, monday)).toBe(true);
    expect(isReportDue('weekly', null, new Date('2026-09-21T06:00:00Z'))).toBe(false);
    expect(isReportDue('weekly', null, new Date('2026-09-22T08:00:00Z'))).toBe(false);
    expect(isReportDue('weekly', new Date('2026-09-21T07:00:00Z'), monday)).toBe(false);
    expect(isReportDue('monthly', null, new Date('2026-10-01T09:00:00Z'))).toBe(true);
    expect(isReportDue('monthly', null, monday)).toBe(false);
  });

  it('renders each website with change against the period before', () => {
    const { subject, text, html } = renderReport(
      [
        {
          id: 'w1',
          name: 'Shop <Main>',
          visitors: 150,
          views: 400,
          bounceRate: 0.42,
          visitTime: 95,
          previous: { visitors: 100, views: 500 },
          pages: [{ x: '/pricing', y: 80 }],
          sources: [{ x: 'google.com', y: 30 }],
          errors: 12,
          newErrors: 2,
        },
      ],
      'weekly',
      reportPeriod('weekly', new Date('2026-09-21T08:00:00Z')),
    );

    expect(subject).toBe('Your weekly analytics: 2026-09-14 to 2026-09-20');
    expect(text).toContain('Visitors 150 (+50% on last week) · Views 400 (-20%)');
    expect(text).toContain('Bounce rate 42% · Visit time 1m 35s');
    expect(text).toContain('Errors 12 (2 new)');
    expect(text).toContain('Top pages: /pricing (80)');
    expect(html).toContain('Shop &lt;Main&gt;');
    expect(html).not.toContain('<Main>');
  });
});
