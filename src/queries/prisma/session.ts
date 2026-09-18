import prisma from '@/lib/prisma';

export async function deleteSession(
  websiteId: string,
  sessionId: string,
): Promise<{ id: string } | null> {
  const transaction = prisma.transaction as <T>(input: (tx: any) => Promise<T>) => Promise<T>;

  return transaction(async tx => {
    const session = await tx.session.findFirst({
      where: {
        id: sessionId,
        websiteId,
      },
      select: {
        id: true,
      },
    });

    if (!session) {
      return null;
    }

    const websiteEvents = await tx.websiteEvent.findMany({
      where: {
        websiteId,
        sessionId,
      },
      select: {
        id: true,
        visitId: true,
      },
    });

    const sessionReplays = await tx.sessionReplay.findMany({
      where: {
        websiteId,
        sessionId,
      },
      select: {
        visitId: true,
      },
    });

    const eventIds = websiteEvents.map(({ id }) => id);
    const visitIds = Array.from(
      new Set([...websiteEvents, ...sessionReplays].map(({ visitId }) => visitId)),
    );

    if (eventIds.length) {
      await tx.eventData.deleteMany({
        where: {
          websiteEventId: {
            in: eventIds,
          },
        },
      });
    }

    if (visitIds.length) {
      await tx.sessionReplaySaved.deleteMany({
        where: {
          websiteId,
          visitId: {
            in: visitIds,
          },
        },
      });
    }

    await tx.sessionReplay.deleteMany({
      where: {
        websiteId,
        sessionId,
      },
    });

    await tx.heatmapEvent.deleteMany({
      where: {
        websiteId,
        sessionId,
      },
    });

    await tx.errorEvent.deleteMany({
      where: {
        websiteId,
        sessionId,
      },
    });

    await tx.revenue.deleteMany({
      where: {
        websiteId,
        sessionId,
      },
    });

    await tx.sessionData.deleteMany({
      where: {
        websiteId,
        sessionId,
      },
    });

    await tx.sessionLink.deleteMany({
      where: {
        websiteId,
        sessionId,
      },
    });

    await tx.websiteEvent.deleteMany({
      where: {
        websiteId,
        sessionId,
      },
    });

    await tx.session.delete({
      where: {
        id: sessionId,
      },
    });

    return session;
  });
}

/**
 * Erases everything recorded about one identified user on a website (a data-protection request):
 * every session linked to their ID with its events, replays, heatmap clicks and errors, their
 * server-side errors, and any support links. Error groups remain, with this user's occurrences gone.
 */
export async function forgetUser(websiteId: string, distinctId: string) {
  const [links, sessions] = await Promise.all([
    prisma.client.sessionLink.findMany({
      where: { websiteId, distinctId },
      select: { sessionId: true },
    }),
    prisma.client.session.findMany({
      where: { websiteId, distinctId },
      select: { id: true },
    }),
  ]);
  const sessionIds = [...new Set([...links.map(l => l.sessionId), ...sessions.map(s => s.id)])];

  for (const sessionId of sessionIds) {
    await deleteSession(websiteId, sessionId);
  }

  // A session can be gone already while its links remain.
  await prisma.client.sessionLink.deleteMany({ where: { websiteId, distinctId } });
  const { count: errors } = await prisma.client.errorEvent.deleteMany({
    where: { websiteId, distinctId },
  });
  await prisma.client.supportLink.deleteMany({ where: { websiteId, distinctId } });

  return { sessions: sessionIds.length, errors };
}
