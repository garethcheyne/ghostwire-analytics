#!/usr/bin/env node
/*
 * ghostwire-mcp — run a Ghostwire Analytics MCP endpoint over stdio.
 *
 * For clients that cannot talk to a remote MCP endpoint. Where one can, point
 * it at https://<your-host>/api/mcp directly and skip this.
 *
 *   GHOSTWIRE_HOST=https://analytics.example.com \
 *   GHOSTWIRE_API_KEY=gwa_... npx @ghostwire/mcp
 */
import { forward, negotiatedVersion, splitLines, type BridgeOptions } from './bridge';

/** stderr only. stdout carries protocol messages and nothing else. */
const warn = (message: string) => process.stderr.write(`[ghostwire-mcp] ${message}\n`);

function readConfig(): BridgeOptions {
  const host = process.env.GHOSTWIRE_HOST ?? process.argv[2];
  const apiKey = process.env.GHOSTWIRE_API_KEY ?? process.argv[3];

  if (!host || !apiKey) {
    warn(
      'Set GHOSTWIRE_HOST and GHOSTWIRE_API_KEY (or pass them as arguments).\n' +
        '  GHOSTWIRE_HOST=https://analytics.example.com GHOSTWIRE_API_KEY=gwa_... npx @ghostwire/mcp',
    );
    process.exit(2);
  }

  return { host, apiKey, onError: warn };
}

export function main() {
  const config = readConfig();
  let protocolVersion: string | undefined;
  let buffer = '';

  // Messages are handled one at a time and in order: a client matches
  // responses by id, but ordering still matters for initialize.
  let queue: Promise<unknown> = Promise.resolve();

  process.stdin.setEncoding('utf8');

  process.stdin.on('data', chunk => {
    const { lines, rest } = splitLines(buffer + chunk);
    buffer = rest;

    for (const line of lines) {
      queue = queue.then(async () => {
        const response = await forward(line, { ...config, protocolVersion });
        if (!response) return;

        // Remember what the endpoint settled on, so later requests carry it.
        protocolVersion ??= negotiatedVersion(response);

        process.stdout.write(`${response}\n`);
      });
    }
  });

  // Closing stdin is how a client asks the server to shut down.
  process.stdin.on('end', () => {
    void queue.then(() => process.exit(0));
  });
}

// Only run when invoked as the command, so the module can be imported in tests.
if (process.argv[1] && /ghostwire-mcp|mcp[\/](dist|src)[\/]index/.test(process.argv[1])) {
  main();
}

export { forward, splitLines } from './bridge';
