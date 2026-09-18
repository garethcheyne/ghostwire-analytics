import { z } from 'zod';
import { ROLES } from '@/lib/constants';
import { parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import { userRoleParam } from '@/lib/schema';
import { canCreateUser } from '@/permissions';
import { createUser, getUserByUsername } from '@/queries/prisma';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  const schema = z.object({
    username: z.string().max(255),
    email: z.email(),
    name: z.string().max(255).optional(),
    password: z.string().min(8).max(255),
    role: userRoleParam,
  });

  const { auth, body, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  if (!(await canCreateUser(auth))) {
    return unauthorized();
  }

  const { username, email, name, password, role } = body;

  if (await getUserByUsername(username)) {
    return badRequest({ message: 'User already exists' });
  }

  if (await prisma.client.user.findUnique({ where: { email: email.toLowerCase() } })) {
    return badRequest({ message: 'Email is already in use' });
  }

  const user = await createUser({
    username: username.toLowerCase(),
    email: email.toLowerCase(),
    name,
    password,
    role: role ?? ROLES.user,
  });

  return json(user);
}
