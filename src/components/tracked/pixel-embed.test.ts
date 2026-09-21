import { describe, expect, it } from 'vitest';
import { pixelSnippet } from './pixel-embed';

const url = 'https://analytics.example.com/p/abc123xyz9';

describe('pixelSnippet', () => {
  it('points the image at the pixel URL', () => {
    expect(pixelSnippet(url)).toContain(`src="${url}"`);
  });

  it('never hides the image with display:none', () => {
    // Several mail clients skip loading an image hidden that way, and spam
    // filters score against hidden content — so a "tidy-up" that reinstates
    // it would quietly cut the number of opens ever recorded.
    expect(pixelSnippet(url)).not.toContain('display:none');
  });

  it('is one transparent pixel, with no border to give it away', () => {
    const snippet = pixelSnippet(url);

    expect(snippet).toContain('width="1"');
    expect(snippet).toContain('height="1"');
    expect(snippet).toContain('border:0');
  });

  it('has an empty alt so a blocked image shows nothing', () => {
    // Without this, clients that block remote images announce the pixel with
    // a placeholder or the alt text, in the middle of a signature.
    expect(pixelSnippet(url)).toContain('alt=""');
  });
});
