'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

const SECURITY_PATH = '/settings/security';

/**
 * When two-factor is required but not set up, keeps the user on the security page until they
 * turn it on. (Computed on the server in the main layout.)
 */
export function TwoFactorGate({ required }: { required: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (required && pathname !== SECURITY_PATH) {
      router.replace(SECURITY_PATH);
    }
  }, [required, pathname, router]);

  return null;
}
