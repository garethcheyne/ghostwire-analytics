import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { ROLES } from '@/lib/auth-roles';
import { auth } from '@/lib/better-auth';

/** Administration is for admins only; everyone else gets a 404 (not a hint that it exists). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (session?.user.role !== ROLES.admin) {
    notFound();
  }

  return children;
}
