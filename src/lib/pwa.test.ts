import { describe, expect, it } from 'vitest';
import { describeDevice, urlBase64ToUint8Array } from './pwa';

describe('pwa helpers', () => {
  it('names devices from their user agent', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36',
      ),
    ).toBe('Chrome on Android');
    expect(
      describeDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari on iPhone');
    expect(
      describeDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Edg/128.0',
      ),
    ).toBe('Edge on Windows');
    expect(describeDevice(null)).toBe('Browser');
  });

  it('decodes the url-safe base64 VAPID key', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID_-8'))).toEqual([1, 2, 3, 255, 239]);
  });
});
