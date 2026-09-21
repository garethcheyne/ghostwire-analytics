/*
 * ghostwire-mcp — run a Ghostwire Analytics MCP endpoint over stdio.
 *
 * The shebang is added by tsup's banner at build time, not written here: with
 * both, the built file carries it twice and the second one is a syntax error
 * on line 2.
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

// This file is the command; bridge.ts holds the logic and is what the tests
// import. Guarding on argv[1] to decide whether to run looked tidier and was
// silently broken: the bundler rewrote the path regex so Windows paths never
// matched, and the command started up and did nothing at all.
main();
