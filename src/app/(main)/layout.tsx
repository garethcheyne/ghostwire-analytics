import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { TwoFactorGate } from '@/components/auth/two-factor-gate';
import { Shell } from '@/components/layout/shell';
import { auth } from '@/lib/better-auth';
import { ROLES } from '@/lib/auth-roles';
import { isTwoFactorRequired } from '@/lib/two-factor-policy';
import pkg from '../../../package.json';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect('/login');
  }

  const { user } = session;
  // The shell's SIDEBAR_COOKIE. Spelled out: a value imported from a 'use client' module is only a
  // client reference on the server, not the string.
  const sidebarOpen = (await cookies()).get('sidebar_state')?.value !== 'false';
  const mustSetUpTwoFactor = !user.twoFactorEnabled && (await isTwoFactorRequired(user));

  return (
    <Shell
      user={{
        name: user.name,
        username: user.displayUsername ?? user.username,
        email: user.email,
        image: user.image,
        isAdmin: user.role === ROLES.admin,
      }}
      version={pkg.version}
      defaultOpen={sidebarOpen}
    >
      {children}
      <TwoFactorGate required={mustSetUpTwoFactor} />
    </Shell>
  );
}
