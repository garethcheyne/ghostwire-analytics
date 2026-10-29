import { audit } from '@/lib/audit';
import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { describeSelfMonitoring, setSelfMonitoring } from '@/lib/monitoring/self';
import { getRequireTwoFactorForAll, setRequireTwoFactorForAll } from '@/lib/two-factor-policy';

/** App-wide settings for administrators. */
export async function GET(request: Request) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  if (!auth.user?.isAdmin) {
    return unauthorized();
  }

  const [requireTwoFactor, selfMonitoring] = await Promise.all([
    getRequireTwoFactorForAll(),
    describeSelfMonitoring(),
  ]);

  return json({ requireTwoFactor, selfMonitoring });
}

export async function POST(request: Request) {
  const { auth, body, error } = await parseRequest(
    request,
    z
      .object({ requireTwoFactor: z.boolean().optional(), selfMonitoring: z.boolean().optional() })
      .refine(value => value.requireTwoFactor !== undefined || value.selfMonitoring !== undefined, {
        message: 'Nothing to change.',
      }),
  );

  if (error) {
    return error();
  }

  if (!auth.user?.isAdmin) {
    return unauthorized();
  }

  const result: Record<string, unknown> = {};

  if (body.requireTwoFactor !== undefined) {
    await setRequireTwoFactorForAll(body.requireTwoFactor);
    result.requireTwoFactor = body.requireTwoFactor;
  }

  if (body.selfMonitoring !== undefined) {
    const { websiteId } = await setSelfMonitoring(body.selfMonitoring, auth.user.id);
    result.selfMonitoring = { enabled: body.selfMonitoring, websiteId };
  }

  await audit(request, auth, {
    action: 'admin.settings.update',
    details: result,
  });
  return json(result);
}
