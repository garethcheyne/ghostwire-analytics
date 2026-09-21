/*
 * The MCP endpoint: Streamable HTTP, stateless.
 *
 * Lets an agent in any editor provision a site and read its figures against
 * this instance, authenticating with the same `Authorization: Bearer gwa_…`
 * API key the REST API takes — so permissions, expiry and revocation all
 * behave exactly as they do everywhere else.
 *
 *   claude mcp add ghostwire --transport http \
 *     https://analytics.example.com/api/mcp \
 *     --header "Authorization: Bearer gwa_..."
 *
 * Stateless by design: no session is issued, so nothing has to be kept
 * between requests and several app containers can serve the same client.
 */
import { checkAuth } from '@/lib/auth';
import type { Auth } from '@/lib/types';
import { log } from '@/lib/logger';
import {
  handleMessage,
  RPC,
  rpcError,
  SUPPORTED_PROTOCOL_VERSIONS,
  type JsonRpcMessage,
} from '@/lib/mcp/protocol';
import { buildTools } from '@/lib/mcp/tools';

export const runtime = 'nodejs';
// Every call reads live data; a cached MCP response would be actively wrong.
export const dynamic = 'force-dynamic';

const SERVER_INFO = {
  name: 'ghostwire-analytics',
  title: 'Ghostwire Analytics',
  version: '1.0.0',
  instructions:
    'Privacy-first web analytics. Use ghostwire_list_websites to see what exists before creating anything. ' +
    'After creating a site, paste the returned snippet into the page <head>; for a framework integration ' +
    '(Next.js, React, plain HTML, Node or Python) follow the ghostwire-analytics skill. ' +
    'Reading tools take ISO dates and default to the last 30 days.',
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });

/**
 * The transport requires the Origin header to be checked, so a page in the
 * browser cannot drive a local MCP server it was never given access to. Only
 * browser requests send one; an editor's MCP client does not, and is allowed
 * through on the API key alone.
 */
function originAllowed(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;

  const allowed = [process.env.APP_URL, process.env.BETTER_AUTH_URL].filter(Boolean) as string[];

  try {
    const host = new URL(origin).host;
    return host === new URL(request.url).host || allowed.some(url => new URL(url).host === host);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!originAllowed(request)) {
    return json({ error: 'Origin not allowed.' }, 403);
  }

  // Absent means an older client; the specification says to assume 2025-03-26
  // rather than reject, so only a version we genuinely cannot speak is a 400.
  const version = request.headers.get('mcp-protocol-version');
  if (version && !SUPPORTED_PROTOCOL_VERSIONS.includes(version as any)) {
    return json(
      { error: `Unsupported MCP-Protocol-Version "${version}".`, supported: SUPPORTED_PROTOCOL_VERSIONS },
      400,
    );
  }

  let message: JsonRpcMessage;

  try {
    message = await request.json();
  } catch {
    return json(rpcError(null, RPC.parseError, 'Request body is not valid JSON.'), 400);
  }

  if (Array.isArray(message)) {
    // Batching was removed in 2025-06-18 and this server never supported it.
    return json(rpcError(null, RPC.invalidRequest, 'Send one JSON-RPC message per request.'), 400);
  }

  const auth = await checkAuth(request);

  // A share token is not a user: it can read one website's dashboard, which is
  // not the same as holding the keys to create sites or issue ingest keys.
  if (!auth?.user) {
    return json(
      rpcError(
        message.id ?? null,
        RPC.invalidRequest,
        'Send an API key: Authorization: Bearer gwa_… Create one under Settings → API keys.',
      ),
      401,
    );
  }

  // checkAuth types username as nullable for API-key callers while Auth wants
  // a string; the tools only ever read user.id, so it is normalised here
  // rather than loosening the shared type.
  const tools = buildTools({
    ...auth,
    user: { ...auth.user, username: auth.user.username ?? '' },
  } as Auth);

  const response = await handleMessage(message, { tools, info: SERVER_INFO });

  // Notifications and responses are acknowledged with an empty 202, as the
  // Streamable HTTP transport requires.
  if (!response) {
    return new Response(null, { status: 202 });
  }

  if (message.method === 'tools/call') {
    log.info('mcp.tool', { tool: message.params?.name, user: auth.user.id });
  }

  return json(response);
}

/**
 * The transport lets a client open an SSE stream here for server-initiated
 * messages. This server never sends any, so it declines — which the
 * specification allows, and which clients handle.
 */
export function GET() {
  return json({ error: 'This MCP endpoint does not stream. POST JSON-RPC messages instead.' }, 405);
}

/** Sessions are never issued, so there is none to delete. */
export function DELETE() {
  return json({ error: 'This MCP endpoint is stateless; there is no session to end.' }, 405);
}
