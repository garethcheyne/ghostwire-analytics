/*
 * The Ghostwire mark, for embedding in generated PDFs.
 *
 * Read from disk once and held as a buffer: react-pdf would otherwise re-read
 * the file for every report, and passing it a URL would make report generation
 * depend on the app being able to reach itself over the network.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let cached: Buffer | null | undefined;

/**
 * The logo, or null when it cannot be read.
 *
 * Null rather than throwing: a missing image is a reason to fall back to the
 * wordmark, not to fail a report someone is waiting on. `public/` is copied
 * into the standalone build, so this resolves the same in Docker as in dev.
 */
export function ghostwireLogo(): Buffer | null {
  if (cached !== undefined) return cached;

  try {
    cached = readFileSync(join(process.cwd(), 'public', 'logo.png'));
  } catch {
    cached = null;
  }

  return cached;
}
