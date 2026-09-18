import { z } from 'zod';
import { sendReport } from '@/lib/email-reports';
import { parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';

const schema = z.object({
  frequency: z.enum(['weekly', 'monthly']).default('weekly'),
  websiteIds: z.array(z.uuid()).max(20).default([]),
});

/** Sends your report now (to check what it looks like). */
export async function POST(request: Request) {
  const { auth, body, error } = await parseRequest(request, schema);
  if (error) return error();
  if (!auth.user) return unauthorized();

  try {
    await sendReport(auth.user.id, body.frequency, body.websiteIds);
    return json({ ok: true });
  } catch (e) {
    return badRequest({ message: e instanceof Error ? e.message : 'Could not send the report.' });
  }
}
