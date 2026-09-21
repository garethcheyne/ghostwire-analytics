/*
 * The JSON-RPC layer of the MCP endpoint.
 *
 * Deliberately small and hand-written rather than pulled from the SDK. A
 * stateless, tools-only Streamable HTTP server has a tiny protocol surface —
 * initialize, ping, tools/list, tools/call — and the SDK's transports expect
 * Node request/response objects, which the App Router does not deal in. The
 * shapes here follow the 2025-06-18 specification; the tests pin them.
 *
 * Nothing here knows about analytics. Tools are handed in, so the same layer
 * would serve any other set.
 */

/** Newest first: the first entry is what we answer with when asked for one we do not know. */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;

export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

/** Standard JSON-RPC codes. MCP adds no codes of its own for this surface. */
export const RPC = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

export type JsonRpcId = string | number | null;

export interface JsonRpcMessage {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, any>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** What a tool returns to the caller. */
export interface ToolResult {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  /**
   * A tool that failed reports it here rather than as a JSON-RPC error: the
   * model is meant to see what went wrong and try something else, which it
   * cannot do if the transport swallows it as a protocol fault.
   */
  isError?: boolean;
}

export interface McpTool {
  name: string;
  title: string;
  description: string;
  /** JSON Schema, usually produced from a Zod schema with z.toJSONSchema(). */
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  handler: (args: Record<string, any>) => Promise<ToolResult>;
}

export interface ServerInfo {
  name: string;
  title: string;
  version: string;
  instructions?: string;
}

const ok = (id: JsonRpcId, result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result });

const fail = (
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse => ({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });

/** A message with no `id` is a notification: it is acknowledged, never answered. */
export const isNotification = (message: JsonRpcMessage) =>
  message.id === undefined || message.id === null;

/**
 * Handle one JSON-RPC message.
 *
 * Returns undefined for anything that takes no reply (notifications), which
 * the route turns into a 202 as the transport requires.
 */
export async function handleMessage(
  message: JsonRpcMessage,
  { tools, info }: { tools: McpTool[]; info: ServerInfo },
): Promise<JsonRpcResponse | undefined> {
  const { method, params } = message;
  const id = message.id ?? null;

  if (message.jsonrpc !== '2.0' || typeof method !== 'string') {
    return isNotification(message)
      ? undefined
      : fail(id, RPC.invalidRequest, 'Not a JSON-RPC 2.0 request.');
  }

  // Notifications are acknowledged whatever they are: a client is free to send
  // ones we do not implement, and replying to them is a protocol error.
  if (isNotification(message)) return undefined;

  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      // Answer with the client's version when we speak it, otherwise our
      // newest and let the client decide whether it can continue.
      const version = SUPPORTED_PROTOCOL_VERSIONS.includes(asked)
        ? asked
        : LATEST_PROTOCOL_VERSION;

      return ok(id, {
        protocolVersion: version,
        // Only tools. Claiming a capability we do not serve invites calls that
        // can only fail.
        capabilities: { tools: {} },
        serverInfo: { name: info.name, title: info.title, version: info.version },
        ...(info.instructions ? { instructions: info.instructions } : {}),
      });
    }

    case 'ping':
      return ok(id, {});

    case 'tools/list':
      return ok(id, {
        tools: tools.map(({ handler: _handler, ...tool }) => tool),
      });

    case 'tools/call': {
      const name = params?.name;
      const tool = tools.find(candidate => candidate.name === name);

      if (!tool) {
        return fail(id, RPC.invalidParams, `No tool named "${name}".`, {
          available: tools.map(candidate => candidate.name),
        });
      }

      try {
        return ok(id, await tool.handler(params?.arguments ?? {}));
      } catch (error) {
        // A tool that threw is still a successful call at the protocol level;
        // the failure belongs in the result where the model can read it.
        return ok(id, {
          content: [
            {
              type: 'text',
              text: error instanceof Error ? error.message : 'The tool failed.',
            },
          ],
          isError: true,
        });
      }
    }

    default:
      return fail(id, RPC.methodNotFound, `Unsupported method "${method}".`);
  }
}

export { fail as rpcError };
