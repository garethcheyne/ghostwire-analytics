import type { Metadata } from 'next';
import { TwoFactorForm } from '@/components/auth/two-factor-form';

export const metadata: Metadata = { title: 'Two-factor authentication' };

export default async function TwoFactorPage({ searchParams }: PageProps<'/login/two-factor'>) {
  const { next } = await searchParams;

  return <TwoFactorForm next={typeof next === 'string' ? next : undefined} />;
}
