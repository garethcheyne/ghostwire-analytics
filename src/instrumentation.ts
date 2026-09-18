export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { log } = await import('@/lib/logger');
    log.info('app.start', {
      version: process.env.npm_package_version,
      node: process.version,
      logDir: process.env.LOG_DIR ?? null,
      email: !!process.env.SMTP_URL,
      sso: !!process.env.OIDC_DISCOVERY_URL,
      retention: process.env.DATA_RETENTION_DAYS ?? null,
      sharedRateLimits: process.env.RATE_LIMIT_STORE === 'postgres',
    });

    const { ensureAdminUser } = await import('@/lib/setup');

    try {
      await ensureAdminUser();
    } catch (error) {
      // Don't block startup (e.g. database not migrated yet); log and carry on.
      log.error('setup.admin_check_failed', { error });
    }

    // Deletes old replay/heatmap/error data, only when a retention period is configured.
    const { startRetentionSchedule } = await import('@/lib/retention');
    startRetentionSchedule();

    // Error spike and traffic drop alerts, every 5 minutes.
    const { startAlertSchedule } = await import('@/lib/alerts');
    startAlertSchedule();

    // Weekly and monthly email reports (checked hourly; only when SMTP is set up).
    const { startEmailReportSchedule } = await import('@/lib/email-reports');
    startEmailReportSchedule();

    // Traffic counters (accepted, dropped and why, server errors), logged every 5 minutes.
    const { startStatsSchedule } = await import('@/lib/metrics');
    startStatsSchedule();
  }
}

/** Server errors Next.js caught (pages, route handlers, server actions): logged with the route. */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string; renderSource?: string },
) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const [{ log }, { count }] = await Promise.all([import('@/lib/logger'), import('@/lib/metrics')]);

  count('http.server_error');
  log.error('request.error', {
    method: request.method,
    // The path without the query string, which can carry tokens.
    path: request.path.split('?')[0],
    route: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
    error,
  });
}
