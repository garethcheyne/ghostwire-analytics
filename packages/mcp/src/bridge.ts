/*
 * A JSON-RPC bridge from stdio to a Ghostwire Analytics MCP endpoint.
 *
 * Deliberately a bridge and not a second server: it forwards whole messages
 * and never interprets them, so whatever tools the instance exposes are
 * available here the moment they ship, with nothing to keep in step. The
 * protocol lives in one place — the app.
 *
 * It exists because not every MCP client can talk to a remote endpoint. Where
 * one can, point it straight at /api/mcp and skip this entirely.
 */

export interface BridgeOptions {
  /** The Ghostwire instance, e.g. https://analytics.example.com */
  host: string;
  /** An API key from Settings → API keys (gwa_…). */
  apiKey: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  /** Where to report trouble. Never stdout: that carries protocol messages only. */
  onError?: (message: string) => void;
}

/** JSON-RPC over stdio is newline-delimited, and a message may not contain one. */
export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split('\n');
  // The last piece has no newline yet, so it may be half a message.
  const rest = parts.pop() ?? '';

  return { lines: parts.map(line => line.trim()).filter(Boolean), rest };
}

const endpointFor = (host: string) => `${host.replace(/\/+$/, '')}/api/mcp`;

/**
 * Forwards one message and returns what should go back on stdout, or null
 * when nothing should (the endpoint acknowledges notifications with a 202 and
 * an empty body).
 *
 * Never throws: a bridge that dies on a bad response takes the client's whole
 * session with it. Anything that goes wrong comes back as a JSON-RPC error
 * against the message's own id, which is what the client is waiting for.
 */
export async function forward(
  raw: string,
  options: BridgeOptions & { protocolVersion?: string },
): Promise<string | null> {
  const { host, apiKey, fetchImpl = fetch, onError, protocolVersion } = options;

  let id: unknown = null;

  try {
    const message = JSON.parse(raw);
    id = message?.id ?? null;

    const response = await fetchImpl(endpointFor(host), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Both are required of a client by the Streamable HTTP transport.
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${apiKey}`,
        ...(protocolVersion ? { 'mcp-protocol-version': protocolVersion } : {}),
      },
      body: raw,
    });

    // A notification was accepted; there is nothing to write back.
    if (response.status === 202) return null;

    const body = await response.text();

    if (!response.ok) {
      onError?.(`Ghostwire returned ${response.status}: ${body.slice(0, 200)}`);

      // Pass a real JSON-RPC error through untouched rather than wrapping it.
      try {
        const parsed = JSON.parse(body);
        if (parsed?.error) return JSON.stringify(parsed);
      } catch {
        /* not JSON; fall through to the generic error below */
      }

      return errorFor(
        id,
        response.status === 401
          ? 'Ghostwire rejected the API key. Check GHOSTWIRE_API_KEY is a current gwa_ key.'
          : `Ghostwire returned HTTP ${response.status}.`,
      );
    }

    return body;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    onError?.(detail);

    return errorFor(id, `Could not reach Ghostwire at ${host}: ${detail}`);
  }
}

function errorFor(id: unknown, message: string) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code: -32603, message },
  });
}

/** The version the endpoint settled on, so later requests can carry it. */
export function negotiatedVersion(responseBody: string): string | undefined {
  try {
    return JSON.parse(responseBody)?.result?.protocolVersion;
  } catch {
    return undefined;
  }
}
