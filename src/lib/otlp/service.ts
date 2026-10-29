import { type Attributes, attrString } from './values';

/** A reporting service, from its OTel resource attributes. */
export interface ServiceInfo {
  /** `${namespace}\u0000${name}`: unique per website. */
  key: string;
  /** service.namespace: the app, e.g. ghostwire-secure. */
  namespace: string;
  /** service.name, e.g. api or collector-github. */
  name: string;
  version: string | null;
  environment: string | null;
  language: string | null;
}

/** What a service without service.name is called (the OTel SDK default, minus the language). */
export const UNKNOWN_SERVICE = 'unknown_service';

export function readService(resource: Attributes): ServiceInfo {
  const namespace = (attrString(resource, 'service.namespace') ?? '').slice(0, 100);
  let name = (attrString(resource, 'service.name') ?? '').slice(0, 100);

  // SDKs fill in "unknown_service:node" when the app didn't name itself.
  if (!name || name.startsWith(`${UNKNOWN_SERVICE}:`)) name = UNKNOWN_SERVICE;

  return {
    key: `${namespace}\u0000${name}`,
    namespace,
    name,
    version: attrString(resource, 'service.version')?.slice(0, 100) ?? null,
    environment:
      attrString(resource, 'deployment.environment.name', 'deployment.environment')?.slice(0, 50) ?? null,
    language: attrString(resource, 'telemetry.sdk.language')?.slice(0, 30) ?? null,
  };
}
