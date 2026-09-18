import type { Metadata } from 'next';
import Image from 'next/image';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { ShareFooter } from '@/components/share/share-view';

export const metadata: Metadata = {
  title: 'Support timeline',
  // Support links are private to whoever has them: keep them out of search engines.
  robots: { index: false, follow: false },
};

export default function SupportLayout({ children }: LayoutProps<'/support/[slug]'>) {
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="" width={28} height={28} className="size-7 object-contain" />
          <span className="text-brand-gradient font-bold">Ghostwire</span>
          <span className="text-xs tracking-wider text-muted-foreground uppercase">Analytics</span>
        </div>
        <ThemeToggle />
      </header>
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6">{children}</main>
      <ShareFooter />
    </div>
  );
}
