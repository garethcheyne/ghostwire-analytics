import { getBoardEntityIds } from '@/lib/boards';
import { ENTITY_TYPE, ROLES, SHARE_TOKEN_TYPE } from '@/lib/constants';
import { secret } from '@/lib/crypto';
import { createToken } from '@/lib/jwt';
import prisma from '@/lib/prisma';
import { json, notFound } from '@/lib/response';
import type { Auth, BoardParameters } from '@/lib/types';
import { canViewLink, canViewPixel, canViewWebsite } from '@/permissions';
import { getBoard, getLink, getPixel, getShareByCode, getUser, getWebsite } from '@/queries/prisma';

type BoardEntityIds = ReturnType<typeof getBoardEntityIds>;
type OwnedEntity = { userId?: string | null; teamId?: string | null } | null;

async function filterEntityIds(
  ids: string[],
  canView: (id: string) => Promise<boolean>,
): Promise<string[]> {
  const results = await Promise.all(
    ids.map(async id => {
      try {
        return (await canView(id)) ? id : null;
      } catch {
        return null;
      }
    }),
  );

  return results.filter((id): id is string => !!id);
}

async function getTeamUserIds(teamId: string) {
  const teamUsers = await prisma.client.member.findMany({
    where: { organizationId: teamId },
    select: { userId: true },
  });

  return new Set(teamUsers.map(({ userId }) => userId));
}

function isOwnedByTeam(entity: OwnedEntity, teamId: string, teamUserIds: Set<string>) {
  return entity?.teamId === teamId || !!(entity?.userId && teamUserIds.has(entity.userId));
}

async function filterBoardEntityIdsForShare(
  entity: { userId?: string | null; teamId?: string | null },
  ids: BoardEntityIds,
): Promise<BoardEntityIds> {
  const { teamId } = entity;

  if (teamId) {
    const teamUserIds = await getTeamUserIds(teamId);

    return {
      websiteIds: await filterEntityIds(ids.websiteIds, async id =>
        isOwnedByTeam(await getWebsite(id), teamId, teamUserIds),
      ),
      pixelIds: await filterEntityIds(ids.pixelIds, async id =>
        isOwnedByTeam(await getPixel(id), teamId, teamUserIds),
      ),
      linkIds: await filterEntityIds(ids.linkIds, async id =>
        isOwnedByTeam(await getLink(id), teamId, teamUserIds),
      ),
    };
  }

  if (!entity.userId) {
    return { websiteIds: [], pixelIds: [], linkIds: [] };
  }

  const user = await getUser(entity.userId);

  if (!user) {
    return { websiteIds: [], pixelIds: [], linkIds: [] };
  }

  const auth: Auth = {
    user: {
      id: user.id,
      username: user.username ?? '',
      role: user.role ?? ROLES.user,
      isAdmin: user.role === ROLES.admin,
    },
  };

  return {
    websiteIds: await filterEntityIds(ids.websiteIds, id => canViewWebsite(auth, id)),
    pixelIds: await filterEntityIds(ids.pixelIds, id => canViewPixel(auth, id)),
    linkIds: await filterEntityIds(ids.linkIds, id => canViewLink(auth, id)),
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const share = await getShareByCode(slug);

  if (!share) {
    return notFound();
  }

  const data: Record<string, any> = {
    shareId: share.id,
    shareType: share.shareType,
    parameters: share.parameters,
  };

  let entity: OwnedEntity = null;

  if (share.shareType === ENTITY_TYPE.board) {
    const board = await getBoard(share.entityId);
    if (!board) return notFound();
    entity = board;
    data.boardId = share.entityId;
    const boardEntityIds = getBoardEntityIds({
      type: board.type,
      parameters: board.parameters as BoardParameters,
    });
    const authorizedEntityIds = await filterBoardEntityIdsForShare(board, boardEntityIds);
    data.websiteIds = authorizedEntityIds.websiteIds;
    data.pixelIds = authorizedEntityIds.pixelIds;
    data.linkIds = authorizedEntityIds.linkIds;
  } else if (share.shareType === ENTITY_TYPE.website) {
    entity = await getWebsite(share.entityId);
    if (!entity) return notFound();
    data.websiteId = share.entityId;
  } else if (share.shareType === ENTITY_TYPE.pixel) {
    entity = await getPixel(share.entityId);
    if (!entity) return notFound();
    data.websiteId = share.entityId;
    data.pixelId = share.entityId;
  } else if (share.shareType === ENTITY_TYPE.link) {
    entity = await getLink(share.entityId);
    if (!entity) return notFound();
    data.websiteId = share.entityId;
    data.linkId = share.entityId;
  } else {
    return notFound();
  }

  data.token = createToken({ ...data, type: SHARE_TOKEN_TYPE }, secret());

  // Board shares: names of the widgets' websites, links and pixels (the viewer can't list them).
  if (share.shareType === ENTITY_TYPE.board) {
    const ids = [...data.websiteIds, ...data.pixelIds, ...data.linkIds];
    const entities = ids.length
      ? await prisma.client.website.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        })
      : [];
    const [links, pixels] = await Promise.all([
      data.linkIds.length
        ? prisma.client.link.findMany({
            where: { id: { in: data.linkIds } },
            select: { id: true, name: true },
          })
        : [],
      data.pixelIds.length
        ? prisma.client.pixel.findMany({
            where: { id: { in: data.pixelIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);
    data.names = Object.fromEntries(
      [...entities, ...links, ...pixels].map(entity => [entity.id, entity.name]),
    );
  }

  return json(data);
}
