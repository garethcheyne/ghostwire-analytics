import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import type { Auth } from '@/lib/types';

export async function GET(request: Request) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  // Share links authenticate without a user; these routes are about the signed-in user.
  if (!auth.user) {
    return unauthorized();
  }

  return json(auth as Auth);
}
