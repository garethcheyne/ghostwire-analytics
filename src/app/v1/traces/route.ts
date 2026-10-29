import { handleOtlpRequest } from '@/lib/otlp/http';

/*
 * OTLP/HTTP traces receiver for system monitoring: POST /v1/traces with the website's ingest key
 * (Authorization: Bearer gwe_…). See src/lib/otlp/http.ts.
 */
export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return handleOtlpRequest(request, 'traces');
}
