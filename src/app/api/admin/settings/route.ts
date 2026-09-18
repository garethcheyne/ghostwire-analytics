import { audit } from '@/lib/audit';
import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
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

  return json({ requireTwoFactor: await getRequireTwoFactorForAll() });
}

export async function POST(request: Request) {
  const { auth, body, error } = await parseRequest(
    request,
    z.object({ requireTwoFactor: z.boolean() }),
  );

  if (error) {
    return error();
  }

  if (!auth.user?.isAdmin) {
    return unauthorized();
  }

  await setRequireTwoFactorForAll(body.requireTwoFactor);

  await audit(request, auth, {
    action: 'admin.settings.update',
    details: { requireTwoFactor: body.requireTwoFactor },
  });
  return json({ requireTwoFactor: body.requireTwoFactor });
}
