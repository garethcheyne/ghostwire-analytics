export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureAdminUser } = await import('@/lib/setup');

    try {
      await ensureAdminUser();
    } catch (error) {
      // Don't block startup (e.g. database not migrated yet); log and carry on.
      console.error('Could not check for an admin user:', error);
    }
  }
}
