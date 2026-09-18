import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/login-form';
import { getSsoConfig } from '@/lib/sso';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next, error } = await searchParams;

  return (
    <LoginForm
      next={typeof next === 'string' ? next : undefined}
      ssoName={getSsoConfig()?.name}
      ssoError={typeof error === 'string' ? error : undefined}
    />
  );
}
