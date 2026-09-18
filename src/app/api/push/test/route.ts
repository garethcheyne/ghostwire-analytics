import { appUrl } from '@/lib/notify';
import { sendPush } from '@/lib/push';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';

/** Sends a test notification to all of your devices. */
export async function POST(request: Request) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();
  if (!auth.user) return unauthorized();

  const result = await sendPush([auth.user.id], {
    title: 'Ghostwire Analytics',
    body: 'Notifications are working on this device.',
    url: appUrl('/settings/notifications') ?? '/settings/notifications',
    tag: 'test',
  });

  return json(result);
}
