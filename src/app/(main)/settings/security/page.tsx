import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { SecuritySettings } from '@/components/settings/security-settings';
import { auth } from '@/lib/better-auth';
import { isTwoFactorRequired } from '@/lib/two-factor-policy';

export const metadata: Metadata = { title: 'Security' };

export default async function SecurityPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const required = session ? await isTwoFactorRequired(session.user) : false;

  return <SecuritySettings twoFactorRequired={required} />;
}
