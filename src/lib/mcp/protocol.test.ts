import { describe, expect, test } from 'vitest';
import {
  handleMessage,
  LATEST_PROTOCOL_VERSION,
  RPC,
  type McpTool,
} from './protocol';

const info = { name: 'ghostwire-analytics', title: 'Ghostwire Analytics', version: '1.0.0' };

const tool = (overrides: Partial<McpTool> = {}): McpTool => ({
  name: 'ghostwire_ping',
  title: 'Ping',
  description: 'Returns pong.',
  inputSchema: { type: 'object' },
  handler: async () => ({ content: [{ type: 'text', text: 'pong' }] }),
  ...overrides,
});

const call = (message: Record<string, unknown>, tools: McpTool[] = [tool()]) =>
  handleMessage(message, { tools, info });

describe('initialize', () => {
  test('answers with the version the client asked for when we speak it', async () => {
    const response = await call({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    });

    expect((response?.result as any).protocolVersion).toBe('2024-11-05');
  });

  test('falls back to our newest version for one we do not know', async () => {
    // The specification has the server name a version it supports rather than
    // refuse, and lets the client decide whether it can continue.
    const response = await call({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '1999-01-01' },
    });

    expect((response?.result as any).protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
  });

  test('advertises tools and nothing else', async () => {
    // Claiming prompts or resources we do not serve invites calls that can
    // only fail.
    const response = await call({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });

    expect((response?.result as any).capabilities).toEqual({ tools: {} });
  });
});

describe('notifications', () => {
  test('are acknowledged without a reply', async () => {
    // Replying to a notification is itself a protocol error.
    expect(await call({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeUndefined();
  });

  test('are accepted even when we do not implement them', async () => {
    expect(await call({ jsonrpc: '2.0', method: 'notifications/cancelled' })).toBeUndefined();
  });
});

describe('tools/list', () => {
  test('describes each tool without leaking the handler', async () => {
    const response = await call({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const [described] = (response?.result as any).tools;

    expect(described.name).toBe('ghostwire_ping');
    expect(described.inputSchema).toEqual({ type: 'object' });
    expect(described).not.toHaveProperty('handler');
  });
});

describe('tools/call', () => {
  test('runs the tool and returns its content', async () => {
    const response = await call({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'ghostwire_ping', arguments: {} },
    });

    expect((response?.result as any).content[0].text).toBe('pong');
  });

  test('reports a thrown tool as a result, not a protocol error', async () => {
    // The model is meant to read what went wrong and try something else, which
    // it cannot do if the failure comes back as a transport fault.
    const response = await call({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'ghostwire_ping' },
    }, [tool({ handler: async () => { throw new Error('the database is down'); } })]);

    expect(response?.error).toBeUndefined();
    expect((response?.result as any).isError).toBe(true);
    expect((response?.result as any).content[0].text).toBe('the database is down');
  });

  test('names the tools that do exist when asked for one that does not', async () => {
    const response = await call({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'ghostwire_nope' },
    });

    expect(response?.error?.code).toBe(RPC.invalidParams);
    expect((response?.error?.data as any).available).toEqual(['ghostwire_ping']);
  });
});

describe('malformed input', () => {
  test('rejects anything that is not JSON-RPC 2.0', async () => {
    const response = await call({ id: 6, method: 'tools/list' });

    expect(response?.error?.code).toBe(RPC.invalidRequest);
  });

  test('rejects an unknown method', async () => {
    const response = await call({ jsonrpc: '2.0', id: 7, method: 'resources/list' });

    expect(response?.error?.code).toBe(RPC.methodNotFound);
  });
});
