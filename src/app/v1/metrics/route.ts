import { handleOtlpRequest } from '@/lib/otlp/http';

/*
 * OTLP/HTTP metrics receiver for system monitoring: POST /v1/metrics with the website's ingest key
 * (Authorization: Bearer gwe_…). See src/lib/otlp/http.ts.
 */
export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return handleOtlpRequest(request, 'metrics');
}
