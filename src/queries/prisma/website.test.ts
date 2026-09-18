import { beforeEach, describe, expect, test, vi } from 'vitest';
import { deleteWebsite, resetWebsite } from './website';

const { transactionMock, redisDelMock, redisSetMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  redisDelMock: vi.fn(),
  redisSetMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    transaction: transactionMock,
  },
  getSchema: () => new URL(process.env.DATABASE_URL || '').searchParams.get('schema'),
}));

function createDeleteTx(calls: string[]) {
  return {
    sessionReplaySaved: {
      deleteMany: vi.fn(async () => {
        calls.push('sessionReplaySaved');
      }),
    },
    sessionReplay: {
      deleteMany: vi.fn(async () => {
        calls.push('sessionReplay');
      }),
    },
    heatmapEvent: {
      deleteMany: vi.fn(async () => {
        calls.push('heatmapEvent');
      }),
    },
    errorEvent: {
      deleteMany: vi.fn(async () => {
        calls.push('errorEvent');
      }),
    },
    errorGroup: {
      deleteMany: vi.fn(async () => {
        calls.push('errorGroup');
      }),
    },
    revenue: {
      deleteMany: vi.fn(async () => {
        calls.push('revenue');
      }),
    },
    eventData: {
      deleteMany: vi.fn(async () => {
        calls.push('eventData');
      }),
    },
    $executeRawUnsafe: vi.fn(async () => {
      calls.push('rawSql');
    }),
    sessionData: {
      deleteMany: vi.fn(async () => {
        calls.push('sessionData');
      }),
    },
    sessionLink: {
      deleteMany: vi.fn(async () => {
        calls.push('sessionLink');
      }),
    },
    websiteEvent: {
      deleteMany: vi.fn(async () => {
        calls.push('websiteEvent');
      }),
    },
    session: {
      deleteMany: vi.fn(async () => {
        calls.push('session');
      }),
    },
    report: {
      deleteMany: vi.fn(async () => {
        calls.push('report');
      }),
    },
    alertRule: {
      deleteMany: vi.fn(async () => {
        calls.push('alertRule');
      }),
    },
    alertLog: {
      deleteMany: vi.fn(async () => {
        calls.push('alertLog');
      }),
    },
    release: {
      deleteMany: vi.fn(async () => {
        calls.push('release');
      }),
    },
    sourceMap: {
      deleteMany: vi.fn(async () => {
        calls.push('sourceMap');
      }),
    },
    supportLink: {
      deleteMany: vi.fn(async () => {
        calls.push('supportLink');
      }),
    },
    segment: {
      deleteMany: vi.fn(async () => {
        calls.push('segment');
      }),
    },
    annotation: {
      deleteMany: vi.fn(async () => {
        calls.push('annotation');
      }),
    },
    share: {
      deleteMany: vi.fn(async () => {
        calls.push('share');
      }),
    },
    website: {
      delete: vi.fn(async () => {
        calls.push('websiteDelete');
        return { id: 'website-1' };
      }),
      update: vi.fn(async () => {
        calls.push('websiteUpdate');
        return { id: 'website-1' };
      }),
    },
  };
}

describe('website delete dependencies', () => {
  beforeEach(() => {
    transactionMock.mockReset();
    redisDelMock.mockReset();
    redisSetMock.mockReset();
    delete process.env.CLOUD_MODE;
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/umami?schema=public';
  });

  test('deleteWebsite runs fast event-data cleanup, a relational safety pass, and heatmap cleanup before deleting website events', async () => {
    const calls: string[] = [];
    const tx = createDeleteTx(calls);

    transactionMock.mockImplementation(async callback => callback(tx));

    await deleteWebsite('website-1');

    expect(tx.eventData.deleteMany).toHaveBeenCalledWith({
      where: { websiteId: 'website-1' },
    });
    expect(tx.heatmapEvent.deleteMany).toHaveBeenCalledWith({
      where: { websiteId: 'website-1' },
    });
    expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(1, 'SET search_path TO "public";');
    expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('delete from event_data'),
      'website-1',
    );
    expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('website_event.website_id = $1'),
      'website-1',
    );
    expect(calls).toEqual([
      'sessionReplaySaved',
      'sessionReplay',
      'heatmapEvent',
      'errorEvent',
      'errorGroup',
      'revenue',
      'eventData',
      'rawSql',
      'rawSql',
      'sessionData',
      'sessionLink',
      'websiteEvent',
      'session',
      'report',
      'alertRule',
      'alertLog',
      'release',
      'sourceMap',
      'supportLink',
      'segment',
      'annotation',
      'share',
      'websiteDelete',
    ]);
  });

  test('resetWebsite uses the same two-pass event-data cleanup before resetting the website', async () => {
    const calls: string[] = [];
    const tx = createDeleteTx(calls);

    transactionMock.mockImplementation(async callback => callback(tx));

    await resetWebsite('website-1');

    expect(tx.eventData.deleteMany).toHaveBeenCalledWith({
      where: { websiteId: 'website-1' },
    });
    expect(tx.heatmapEvent.deleteMany).toHaveBeenCalledWith({
      where: { websiteId: 'website-1' },
    });
    expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(1, 'SET search_path TO "public";');
    expect(tx.$executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('website_event.website_id = $1'),
      'website-1',
    );
    expect(calls).toEqual([
      'sessionReplaySaved',
      'sessionReplay',
      'heatmapEvent',
      'errorEvent',
      'errorGroup',
      'revenue',
      'eventData',
      'rawSql',
      'rawSql',
      'sessionData',
      'sessionLink',
      'websiteEvent',
      'session',
      'websiteUpdate',
    ]);
  });
});
