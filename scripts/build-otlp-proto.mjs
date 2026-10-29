/*
 * Regenerates src/lib/otlp/otlp-proto.json, the protobuf descriptor the OTLP ingest decodes with,
 * from the official OpenTelemetry protocol definitions in scripts/otlp-proto/ (Apache-2.0,
 * https://github.com/open-telemetry/opentelemetry-proto, tag in scripts/otlp-proto/VERSION).
 *
 *   node scripts/build-otlp-proto.mjs
 *
 * Only needed after updating the .proto files; the JSON is committed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import protobuf from 'protobufjs';

const here = dirname(fileURLToPath(import.meta.url));
const protoDir = join(here, 'otlp-proto');
const files = [
  'opentelemetry/proto/collector/metrics/v1/metrics_service.proto',
  'opentelemetry/proto/collector/trace/v1/trace_service.proto',
];

const root = new protobuf.Root();
root.resolvePath = (_origin, target) => resolve(protoDir, target);
root.loadSync(files, { keepCase: false });
root.resolveAll();

const version = readFileSync(join(protoDir, 'VERSION'), 'utf8').trim();
const out = join(here, '..', 'src', 'lib', 'otlp', 'otlp-proto.json');
writeFileSync(out, `${JSON.stringify({ version, nested: root.toJSON().nested })}\n`);
console.log(`Wrote ${out} (opentelemetry-proto ${version})`);
