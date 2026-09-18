import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/layout/app-header';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { auth } from '@/lib/better-auth';
import { ROLES } from '@/lib/auth-roles';
import pkg from '../../../package.json';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect('/login');
  }

  const { user } = session;
  const sidebarOpen = (await cookies()).get('sidebar_state')?.value !== 'false';

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar version={pkg.version} />
      <SidebarInset>
        <AppHeader
          user={{
            name: user.name,
            username: user.displayUsername ?? user.username,
            email: user.email,
            image: user.image,
            isAdmin: user.role === ROLES.admin,
          }}
        />
        <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
