import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GhostwireErrorBoundary,
  GhostwireProvider,
  ghostwireRootOptions,
  reportError,
  track,
} from './index';
import { resetQueue } from './tracker';

const WEBSITE_ID = '7d3ecc49-7e12-4672-b092-685c96d2a6d4';

function fakeTracker() {
  return {
    track: vi.fn().mockResolvedValue(undefined),
    identify: vi.fn().mockResolvedValue(undefined),
    error: vi.fn().mockResolvedValue(undefined),
  };
}

/** Simulates the tracker script finishing loading. */
function loadTracker(tracker = fakeTracker()) {
  window.ghostwire = tracker;
  document.querySelector('script[data-website-id]')?.dispatchEvent(new Event('load'));
  return tracker;
}

beforeEach(() => {
  resetQueue();
  delete window.ghostwire;
  document.head.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GhostwireProvider', () => {
  it('adds the tracker script once, with the options as data attributes', () => {
    render(
      <StrictMode>
        <GhostwireProvider
          host="https://analytics.example.com/"
          websiteId={WEBSITE_ID}
          errors
          release="2.4.1"
          domains={['example.com', 'www.example.com']}
        >
          <p>app</p>
        </GhostwireProvider>
      </StrictMode>,
    );

    const scripts = document.querySelectorAll('script[data-website-id]');
    expect(scripts).toHaveLength(1);

    const script = scripts[0] as HTMLScriptElement;
    expect(script.src).toBe('https://analytics.example.com/script.js');
    expect(script.defer).toBe(true);
    expect(script.dataset).toMatchObject({
      websiteId: WEBSITE_ID,
      errors: 'true',
      release: '2.4.1',
      domains: 'example.com,www.example.com',
    });
    expect(screen.getByText('app')).toBeTruthy();
  });

  it('loads the tracker from your own domain when proxied (host="/_gw")', () => {
    render(<GhostwireProvider host="/_gw" websiteId={WEBSITE_ID} />);

    const script = document.querySelector('script[data-website-id]') as HTMLScriptElement;
    expect(script.getAttribute('src')).toBe('/_gw/script.js');
  });

  it('reuses a tracker script already in the page', () => {
    const existing = document.createElement('script');
    existing.dataset.websiteId = WEBSITE_ID;
    document.head.appendChild(existing);

    render(<GhostwireProvider host="https://a.example.com" websiteId={WEBSITE_ID} />);

    expect(document.querySelectorAll('script[data-website-id]')).toHaveLength(1);
  });

  it('identifies the user once the tracker loads, and goes anonymous on sign-out', () => {
    const user = { id: 'jane', email: 'jane@acme.io', name: 'Jane' };
    const { rerender } = render(
      <GhostwireProvider host="https://a.example.com" websiteId={WEBSITE_ID} user={user} />,
    );

    const tracker = loadTracker();
    expect(tracker.identify).toHaveBeenCalledWith('jane', { email: 'jane@acme.io', name: 'Jane' });

    rerender(<GhostwireProvider host="https://a.example.com" websiteId={WEBSITE_ID} user={null} />);
    expect(tracker.identify).toHaveBeenLastCalledWith('', undefined);
    expect(tracker.identify).toHaveBeenCalledTimes(2);
  });

  it("doesn't identify anyone when there was never a user", () => {
    render(<GhostwireProvider host="https://a.example.com" websiteId={WEBSITE_ID} user={null} />);
    const tracker = loadTracker();

    expect(tracker.identify).not.toHaveBeenCalled();
  });
});

describe('calling the tracker', () => {
  it('queues calls made before the tracker loads', () => {
    track('signup', { plan: 'pro' });
    const tracker = fakeTracker();
    window.ghostwire = tracker;

    render(<GhostwireProvider host="https://a.example.com" websiteId={WEBSITE_ID} />);
    loadTracker(tracker);

    expect(tracker.track).toHaveBeenCalledWith('signup', { plan: 'pro' });
  });

  it('never lets a throwing or rejecting tracker reach the app', async () => {
    window.ghostwire = {
      track: () => {
        throw new Error('tracker bug');
      },
      identify: vi.fn(),
      error: () => Promise.reject(new Error('network')),
    };
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    expect(() => track('x')).not.toThrow();
    expect(() => reportError(new Error('y'))).not.toThrow();
    await new Promise(resolve => setTimeout(resolve, 0));

    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe('error reporting', () => {
  it("ghostwireRootOptions reports caught errors and keeps React's logging", () => {
    const tracker = loadTracker();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('boundary caught');

    ghostwireRootOptions().onCaughtError(error, { componentStack: '\n    at Checkout' });

    expect(log).toHaveBeenCalledWith(error);
    expect(tracker.error).toHaveBeenCalledWith(error, { componentStack: '\n    at Checkout' });
  });

  it("ghostwireRootOptions calls the app's own handler instead of logging, and keeps other options", () => {
    loadTracker();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const own = vi.fn();
    const onRecoverableError = vi.fn();

    const options = ghostwireRootOptions({ onCaughtError: own, onRecoverableError });
    options.onCaughtError(new Error('x'), {});

    expect(own).toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(options.onRecoverableError).toBe(onRecoverableError);
  });

  it('GhostwireErrorBoundary shows the fallback, reports the error, and can reset', () => {
    const tracker = loadTracker();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let broken = true;

    function Checkout() {
      if (broken) throw new TypeError('cart is undefined');
      return <p>checkout</p>;
    }

    render(
      <GhostwireErrorBoundary
        fallback={({ reset }) => (
          <button type="button" onClick={reset}>
            Try again
          </button>
        )}
      >
        <Checkout />
      </GhostwireErrorBoundary>,
    );

    expect(tracker.error).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'cart is undefined' }),
      expect.objectContaining({ componentStack: expect.stringContaining('Checkout') }),
    );

    broken = false;
    act(() => screen.getByText('Try again').click());
    expect(screen.getByText('checkout')).toBeTruthy();
  });
});
