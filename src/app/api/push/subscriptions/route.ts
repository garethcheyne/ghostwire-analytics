import { z } from 'zod';
import { saveSubscription } from '@/lib/push';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';

const schema = z.object({
  endpoint: z
    .string()
    .max(1000)
    .refine(value => /^https:\/\//i.test(value), 'Must be an https URL.'),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** Turns on notifications for this browser (the PushSubscription from pushManager.subscribe). */
export async function POST(request: Request) {
  const { auth, body, error } = await parseRequest(request, schema);
  if (error) return error();
  if (!auth.user) return unauthorized();

  const subscription = await saveSubscription(
    auth.user.id,
    body,
    request.headers.get('user-agent'),
  );

  return json({ id: subscription.id });
}
