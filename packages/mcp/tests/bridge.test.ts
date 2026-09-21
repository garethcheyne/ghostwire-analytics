import { describe, expect, it, vi } from 'vitest';
import { forward, negotiatedVersion, splitLines } from '../src/bridge';

const options = { host: 'https://analytics.example.com', apiKey: 'gwa_test' };

const respond = (body: string, init: ResponseInit = {}) =>
  vi.fn().mockResolvedValue(new Response(body, { status: 200, ...init })) as unknown as typeof fetch;

describe('splitLines', () => {
  it('holds back a message that has not finished arriving', () => {
    // stdin delivers chunks, not messages: splitting naively would forward
    // half a JSON object and break the session.
    const { lines, rest } = splitLines('{"a":1}\n{"b":2');

    expect(lines).toEqual(['{"a":1}']);
    expect(rest).toBe('{"b":2');
  });

  it('ignores blank lines between messages', () => {
    expect(splitLines('{"a":1}\n\n{"b":2}\n').lines).toEqual(['{"a":1}', '{"b":2}']);
  });
});

describe('forward', () => {
  it('sends the message on untouched, with the API key', async () => {
    const fetchImpl = respond('{"jsonrpc":"2.0","id":1,"result":{}}');
    const raw = '{"jsonrpc":"2.0","id":1,"method":"tools/list"}';

    await forward(raw, { ...options, fetchImpl });

    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe('https://analytics.example.com/api/mcp');
    expect(init.body).toBe(raw);
    expect(init.headers.authorization).toBe('Bearer gwa_test');
    // Both content types are required of a client by the transport.
    expect(init.headers.accept).toContain('text/event-stream');
  });

  it('writes nothing back for an accepted notification', async () => {
    const fetchImpl = respond('', { status: 202 });

    await expect(
      forward('{"jsonrpc":"2.0","method":"notifications/initialized"}', { ...options, fetchImpl }),
    ).resolves.toBeNull();
  });

  it('turns an unreachable host into a JSON-RPC error rather than dying', async () => {
    // A bridge that throws here takes the client's whole session with it.
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    const response = await forward('{"jsonrpc":"2.0","id":7,"method":"tools/list"}', {
      ...options,
      fetchImpl,
    });

    const parsed = JSON.parse(response!);
    expect(parsed.id).toBe(7);
    expect(parsed.error.message).toContain('ECONNREFUSED');
  });

  it('says plainly when the key was rejected', async () => {
    const fetchImpl = respond('{}', { status: 401 });

    const response = await forward('{"jsonrpc":"2.0","id":2,"method":"tools/list"}', {
      ...options,
      fetchImpl,
    });

    expect(JSON.parse(response!).error.message).toContain('GHOSTWIRE_API_KEY');
  });

  it('passes a real JSON-RPC error through rather than wrapping it', async () => {
    const fetchImpl = respond('{"jsonrpc":"2.0","id":3,"error":{"code":-32601,"message":"nope"}}', {
      status: 400,
    });

    const response = await forward('{"jsonrpc":"2.0","id":3,"method":"bad"}', {
      ...options,
      fetchImpl,
    });

    expect(JSON.parse(response!).error.code).toBe(-32601);
  });

  it('keeps an id even when the request could not be parsed', async () => {
    const fetchImpl = respond('{}');

    const response = await forward('not json', { ...options, fetchImpl });

    expect(JSON.parse(response!).id).toBeNull();
  });
});

describe('negotiatedVersion', () => {
  it('reads the version the endpoint settled on', () => {
    expect(
      negotiatedVersion('{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18"}}'),
    ).toBe('2025-06-18');
  });

  it('returns nothing for a response that carries none', () => {
    expect(negotiatedVersion('{"jsonrpc":"2.0","id":1,"result":{}}')).toBeUndefined();
  });
});
