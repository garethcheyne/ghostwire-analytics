import { describe, expect, it } from 'vitest';
import { proxyInjectionSnippet } from './tracking-code';

describe('proxyInjectionSnippet', () => {
  it('inserts the tracker before </head> in uncompressed HTML', () => {
    const snippet = proxyInjectionSnippet({
      src: 'https://gw.example.com/script.js',
      origin: 'https://gw.example.com',
      websiteId: 'w1',
      errors: true,
      replays: true,
    });

    expect(snippet).toContain('proxy_set_header Accept-Encoding "";');
    expect(snippet).toContain('sub_filter_types text/html;');
    expect(snippet).toContain(
      `sub_filter '</head>' '<script defer src="https://gw.example.com/script.js" data-website-id="w1" data-errors="true"></script><script defer src="https://gw.example.com/recorder.js" data-website-id="w1" data-host-url="https://gw.example.com"></script></head>';`,
    );
    // Only double quotes inside the nginx single-quoted string.
    expect(snippet.split('\n').at(-1)!.slice(22, -3)).not.toContain("'");
  });

  it('leaves out error capture and the recorder unless chosen', () => {
    const snippet = proxyInjectionSnippet({
      src: 'https://gw.example.com/script.js',
      origin: 'https://gw.example.com',
      websiteId: 'w1',
      errors: false,
      replays: false,
    });

    expect(snippet).not.toContain('data-errors');
    expect(snippet).not.toContain('recorder.js');
  });
});
