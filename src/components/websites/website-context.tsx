'use client';
import { createContext, useContext } from 'react';

export interface WebsiteContextValue {
  id: string;
  name: string;
  domain: string | null;
  teamId: string | null;
  userId: string | null;
  canUpdate: boolean;
  canDelete: boolean;
  /** Links and pixels reuse the website reports; some website-only pages don't apply. */
  kind?: 'website' | 'link' | 'pixel';
}

const WebsiteContext = createContext<WebsiteContextValue | null>(null);

export function WebsiteProvider({
  website,
  children,
}: {
  website: WebsiteContextValue;
  children: React.ReactNode;
}) {
  return <WebsiteContext.Provider value={website}>{children}</WebsiteContext.Provider>;
}

/** The website for the current /websites/[websiteId] page, resolved (and access-checked) on the server. */
export function useCurrentWebsite() {
  const website = useContext(WebsiteContext);

  if (!website) {
    throw new Error('useCurrentWebsite must be used inside a website page.');
  }

  return website;
}
