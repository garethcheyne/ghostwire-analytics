import { audit } from '@/lib/audit';
import type { Prisma } from '@/generated/prisma/client';
import { ENTITY_TYPE } from '@/lib/constants';
import { uuid } from '@/lib/crypto';
import { getRecorderConfig, getRecorderEnabled } from '@/lib/recorder';
import { parseRequest } from '@/lib/request';
import { badRequest, json, ok, serverError, unauthorized } from '@/lib/response';
import { canDeleteWebsite, canUpdateWebsite, canViewSharedWebsite } from '@/permissions';
import {
  createShare,
  deleteSharesByEntityId,
  deleteWebsite,
  getShareByEntityId,
  getWebsite,
  updateWebsite,
} from '@/queries/prisma';
import { updateWebsiteRequestSchema } from '../request-schema';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canViewSharedWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const website = await getWebsite(websiteId);

  // Public share pages only need to know what they're showing, not who owns it or its settings.
  if (!auth.user && website) {
    return json({ id: website.id, name: website.name, domain: website.domain });
  }

  return json(website);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, body, error } = await parseRequest(request, updateWebsiteRequestSchema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;
  const { name, domain, shareId, replayConfig, errorsEnabled } = body;

  if (!(await canUpdateWebsite(auth, websiteId))) {
    return unauthorized();
  }

  try {
    const currentWebsite = await getWebsite(websiteId);

    if (!currentWebsite) {
      return badRequest({ message: 'Website not found.' });
    }

    const nextReplayConfig = getRecorderConfig(
      replayConfig === null
        ? {}
        : {
            ...getRecorderConfig(currentWebsite.replayConfig),
            ...(replayConfig ?? {}),
          },
    );

    const website = await updateWebsite(websiteId, {
      name,
      domain,
      errorsEnabled,
      ...(replayConfig !== undefined && {
        replayConfig: nextReplayConfig as Prisma.InputJsonObject,
        recorderEnabled: getRecorderEnabled(nextReplayConfig),
      }),
    });

    if (shareId === null) {
      await deleteSharesByEntityId(website.id);
    }

    const share = shareId
      ? await createShare({
          id: uuid(),
          entityId: websiteId,
          shareType: ENTITY_TYPE.website,
          name: website.name,
          slug: shareId,
          parameters: { overview: true, events: true },
        })
      : await getShareByEntityId(websiteId);

    await audit(request, auth, {
      action: 'website.update',
      targetType: 'website',
      targetId: websiteId,
      websiteId,
      details: { fields: Object.keys(body) },
    });
    return json({
      ...website,
      shareId: share?.slug ?? null,
    });
  } catch (e: any) {
    if (e.message.toLowerCase().includes('unique constraint')) {
      return badRequest({ message: 'That share ID is already taken.' });
    }

    return serverError(e);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canDeleteWebsite(auth, websiteId))) {
    return unauthorized();
  }

  await audit(request, auth, {
    action: 'website.delete',
    targetType: 'website',
    targetId: websiteId,
    websiteId,
  });
  await deleteWebsite(websiteId);

  return ok();
}
