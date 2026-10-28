'use client';
import { LogOut, Settings, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authClient } from '@/lib/auth-client';

export interface HeaderUser {
  name: string;
  username?: string | null;
  email: string;
  image?: string | null;
  isAdmin: boolean;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/** The signed-in user's avatar and account menu, at the far right of the header. */
export function UserMenu({ user }: { user: HeaderUser }) {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-3 border-l pl-2 text-left outline-none sm:pl-4"
        >
          <div className="hidden lg:block">
            <p className="max-w-32 truncate text-sm font-medium">{user.name}</p>
            <p className="max-w-32 truncate text-xs text-muted-foreground">
              {user.username ?? user.email}
            </p>
          </div>
          <Avatar className="size-8 sm:size-9">
            {user.image && <AvatarImage src={user.image} alt={user.name} />}
            <AvatarFallback className="bg-primary text-xs text-primary-foreground sm:text-sm">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>My account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/settings/preferences">
              <Settings />
              Settings
            </Link>
          </DropdownMenuItem>
          {user.isAdmin && (
            <DropdownMenuItem asChild>
              <Link href="/admin/users">
                <ShieldCheck />
                Administration
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onSelect={signOut}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
