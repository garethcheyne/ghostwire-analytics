/*
 * Error reporting helpers: stack parsing, grouping fingerprints and noise filtering, for
 * browser (tracker) and server (Node, Python, C#) reports.
 */
import { createHash } from 'node:crypto';

export type ErrorSource = 'browser' | 'server';
export const ERROR_PLATFORMS = ['javascript', 'node', 'python', 'csharp', 'other'] as const;
export type ErrorPlatform = (typeof ERROR_PLATFORMS)[number];
export const ERROR_STATUSES = ['open', 'resolved', 'ignored'] as const;
export type ErrorStatus = (typeof ERROR_STATUSES)[number];

export interface StackFrame {
  file: string;
  function: string | null;
  line: number | null;
  column: number | null;
  /** False for library, runtime and browser-extension code. */
  inApp: boolean;
}

const MAX_FRAMES = 50;

// V8 (Chrome, Edge, Node): "    at fn (file:1:2)", "    at file:1:2", "    at async fn (file:1:2)"
const V8_FRAME = /^\s*at (?:async )?(?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;
// Firefox / Safari: "fn@file:1:2", "@file:1:2"
const GECKO_FRAME = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/;
// Python: '  File "app/views.py", line 42, in checkout'
const PYTHON_FRAME = /^\s*File "(.+?)", line (\d+)(?:, in (.+))?\s*$/;
// .NET: "   at Shop.Orders.Submit(Order o) in C:\src\Orders.cs:line 42", or without " in ..."
const DOTNET_FRAME = /^\s*at (.+?\))(?: in (.+?):line (\d+))?\s*$/;

function isInApp(file: string, platform: ErrorPlatform) {
  const path = file.replace(/\\/g, '/');

  switch (platform) {
    case 'python':
      return !/(site-packages|dist-packages|\/lib\/python\d|<frozen )/.test(path);
    case 'csharp':
      return true;
    default:
      return !/(node_modules|^node:|^internal\/|<anonymous>|^native|extension:\/\/|^webpack-internal:\/\/\/\(app-pages-browser\)\/\.\/node_modules)/.test(
        path,
      );
  }
}

/**
 * Parses a stack trace into frames, most recent call first (Python tracebacks list the most
 * recent call last, so they're reversed).
 */
export function parseStack(
  stack: string | null | undefined,
  platform: ErrorPlatform,
): StackFrame[] {
  if (!stack) return [];

  const frames: StackFrame[] = [];

  for (const raw of stack.split('\n')) {
    let match: RegExpMatchArray | null;

    if (platform === 'python') {
      if ((match = raw.match(PYTHON_FRAME))) {
        frames.push({
          file: match[1],
          function: match[3]?.trim() || null,
          line: Number(match[2]),
          column: null,
          inApp: isInApp(match[1], platform),
        });
      }
      continue;
    }

    if (platform === 'csharp') {
      if ((match = raw.match(DOTNET_FRAME))) {
        const method = match[1];
        frames.push({
          file: match[2] ?? method.replace(/\.[^.]+\(.*$/, ''),
          function: method,
          line: match[3] ? Number(match[3]) : null,
          column: null,
          // Framework frames are System.* and Microsoft.*; everything else is the app's.
          inApp: !/^(System|Microsoft)\./.test(method),
        });
      }
      continue;
    }

    if ((match = raw.match(V8_FRAME)) || (match = raw.match(GECKO_FRAME))) {
      const [, fn, file, line, column] = match;
      frames.push({
        file,
        function: fn?.trim() || null,
        line: Number(line),
        column: Number(column),
        inApp: isInApp(file, platform),
      });
    }
  }

  if (platform === 'python') frames.reverse();

  return frames.slice(0, MAX_FRAMES);
}

function basename(file: string) {
  const path = file.split(/[?#]/)[0].replace(/\\/g, '/');
  return path.slice(path.lastIndexOf('/') + 1) || path;
}

/** The frame an error is blamed on: the most recent in-app frame, else the most recent frame. */
export function getTopFrame(frames: StackFrame[]) {
  return frames.find(frame => frame.inApp) ?? frames[0] ?? null;
}

/** Short label for where an error happened, e.g. "checkout.js in submitOrder". */
export function getCulprit(frames: StackFrame[]) {
  const frame = getTopFrame(frames);
  if (!frame) return null;

  const file = basename(frame.file);
  return frame.function ? `${file} in ${frame.function}` : file;
}

/**
 * Strips values that vary between occurrences of the same bug (ids, numbers, quoted values,
 * URLs) so they group together.
 */
export function normalizeMessage(message: string) {
  return message
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/(["'`]).*?\1/g, '<str>')
    .replace(/\b0x[0-9a-f]+\b/gi, '<hex>')
    .replace(/\d+(\.\d+)?/g, '<num>')
    .slice(0, 300)
    .trim();
}

/**
 * Errors with the same type, normalized message and blamed frame (file + function, not line,
 * so a deploy that shifts lines keeps the group) are one group.
 */
export function getFingerprint(type: string, message: string, frames: StackFrame[]) {
  const frame = getTopFrame(frames);
  const location = frame
    ? `${basename(frame.file).replace(/[-.][0-9a-f]{8,}(?=\.)/, '')}:${frame.function ?? ''}`
    : '';

  return createHash('sha256')
    .update([type, normalizeMessage(message), location].join('\n'))
    .digest('hex');
}

/**
 * Browser errors we drop: cross-origin "Script error." (no detail to act on), the harmless
 * ResizeObserver loop warning, and errors raised entirely by browser extensions.
 */
export function isNoise(message: string, frames: StackFrame[]) {
  if (/^Script error\.?$/i.test(message.trim())) return true;
  if (
    /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/i.test(message)
  ) {
    return true;
  }
  return frames.length > 0 && frames.every(frame => /extension:\/\//.test(frame.file));
}
