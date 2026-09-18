'use client';
import Link from 'next/link';
import { createContext, type ComponentProps, useContext } from 'react';

export interface ShareContextValue {
  slug: string;
  /** Views the share exposes, e.g. { overview: true, events: true }. */
  sections: Record<string, boolean>;
  /** Whether viewers may filter (click-to-filter, the Filter button). */
  allowFilter: boolean;
}

const ShareContext = createContext<ShareContextValue | null>(null);

export const ShareProvider = ShareContext.Provider;

/** The public share being viewed, or null inside the signed-in app. */
export function useShare() {
  return useContext(ShareContext);
}

/**
 * A link into the signed-in app. On a public share page those pages aren't available, so it
 * renders as plain text instead.
 */
export function AppLink({ href, children, className, ...props }: ComponentProps<typeof Link>) {
  const share = useShare();

  if (share) {
    return <span className={className}>{children}</span>;
  }

  return (
    <Link href={href} className={className} {...props}>
      {children}
    </Link>
  );
}
