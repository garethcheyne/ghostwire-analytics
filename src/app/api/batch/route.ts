import { z } from 'zod';
import * as send from '@/app/api/send/route';
import { isBodyTooLarge } from '@/lib/body-limit';
import { parseRequest } from '@/lib/request';
import { json, payloadTooLarge, serverError } from '@/lib/response';
import { anyObjectParam } from '@/lib/schema';

const schema = z.array(anyObjectParam).max(500);

// Up to 500 events; each one is still checked against /api/send's own limit.
const MAX_BATCH_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    if (await isBodyTooLarge(request, MAX_BATCH_BYTES)) {
      return payloadTooLarge({ maxBytes: MAX_BATCH_BYTES });
    }

    const { body, error } = await parseRequest(request, schema, { skipAuth: true });

    if (error) {
      return error();
    }

    const errors: { index: number; response: any }[] = [];

    let index = 0;
    let cache = null;
    for (const data of body) {
      // Recreate a fresh Request since `new Request(request)` will have the following error:
      // > Cannot read private member #state from an object whose class did not declare it

      // Copy headers we received, ensure JSON content type, and avoid conflicting content-length
      const headers = new Headers(request.headers);
      headers.set('content-type', 'application/json');
      headers.delete('content-length');

      const newRequest = new Request(request.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });

      const response = await send.POST(newRequest);
      const responseJson = await response.json();

      if (!response.ok) {
        errors.push({ index, response: responseJson });
      } else {
        cache ??= responseJson.cache;
      }

      index++;
    }

    return json({
      size: body.length,
      processed: body.length - errors.length,
      errors: errors.length,
      details: errors,
      cache,
    });
  } catch (e) {
    return serverError(e);
  }
}
