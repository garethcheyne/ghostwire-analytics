import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  delete (window as any).ghostwire;
  delete (document as any).currentScript;
  delete (document as any).readyState;
  vi.unstubAllGlobals();
  vi.resetModules();
});

test('identifies data-distinct-id before the initial page view', async () => {
  const script = document.createElement('script');
  script.src = 'https://analytics.example.com/script.js';
  script.dataset.websiteId = 'website-id';
  script.dataset.distinctId = 'visitor-id';

  Object.defineProperties(document, {
    currentScript: { configurable: true, value: script },
    readyState: { configurable: true, value: 'complete' },
  });

  const fetchMock = vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) });
  vi.stubGlobal('fetch', fetchMock);

  await import('./index');

  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const requests = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));

  expect(requests[0]).toMatchObject({
    type: 'identify',
    payload: { id: 'visitor-id', website: 'website-id' },
  });
  expect(requests[1]).toMatchObject({
    type: 'event',
    payload: { id: 'visitor-id', website: 'website-id' },
  });
});

test('sends nothing while the page is shown in the heatmap viewer', async () => {
  const script = document.createElement('script');
  script.src = 'https://analytics.example.com/script.js';
  script.dataset.websiteId = 'website-id';

  Object.defineProperties(document, {
    currentScript: { configurable: true, value: script },
    readyState: { configurable: true, value: 'complete' },
  });

  const fetchMock = vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({}) });
  vi.stubGlobal('fetch', fetchMock);
  window.name = 'ghostwire-heatmap';

  try {
    await import('./index');
    await (window as any).ghostwire.track('clicked');
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    window.name = '';
  }
});

test('reports its size to the heatmap viewer that frames it', async () => {
  const script = document.createElement('script');
  script.src = 'https://analytics.example.com/script.js';
  script.dataset.websiteId = 'website-id';

  Object.defineProperties(document, {
    currentScript: { configurable: true, value: script },
    readyState: { configurable: true, value: 'complete' },
  });

  const postMessage = vi.fn();
  vi.stubGlobal('fetch', vi.fn());
  const parent = Object.getOwnPropertyDescriptor(window, 'parent');
  Object.defineProperty(window, 'parent', { configurable: true, value: { postMessage } });
  window.name = 'ghostwire-heatmap';

  try {
    await import('./index');

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ghostwire:heatmap-frame' }),
      '*',
    );
  } finally {
    window.name = '';
    if (parent) Object.defineProperty(window, 'parent', parent);
  }
});

function loadTracker(attributes: Record<string, string>) {
  const script = document.createElement('script');
  script.src = 'https://analytics.example.com/script.js';
  script.dataset.websiteId = 'website-id';
  Object.entries(attributes).forEach(([key, value]) => script.setAttribute(`data-${key}`, value));

  Object.defineProperties(document, {
    currentScript: { configurable: true, value: script },
    readyState: { configurable: true, value: 'complete' },
  });

  const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: vi.fn().mockResolvedValue({}) });
  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

const sentOfType = (fetchMock: ReturnType<typeof vi.fn>, type: string) =>
  fetchMock.mock.calls
    .map(([, init]) => (init?.body ? JSON.parse(init.body) : null))
    .filter(body => body?.type === type);

// Error listeners stay on window after a test, so the test that enables capture runs last.
test('without data-errors, only manual ghostwire.error() calls are sent', async () => {
  const fetchMock = loadTracker({});
  await import('./index');
  await vi.waitFor(() => expect(sentOfType(fetchMock, 'event')).toHaveLength(1));

  window.dispatchEvent(new ErrorEvent('error', { error: new Error('ignored') }));
  await (window as any).ghostwire.error(new Error('payment failed'), { orderId: 7 });

  const errors = sentOfType(fetchMock, 'error');
  expect(errors).toHaveLength(1);
  expect(errors[0].payload.error).toMatchObject({
    message: 'payment failed',
    handled: true,
    context: { orderId: 7 },
  });
});

test('with data-errors, reports uncaught errors with breadcrumbs, only observing', async () => {
  const fetchMock = loadTracker({ errors: 'true', 'before-send': 'testBeforeSend' });
  // A site hook with a bug: throws for one particular error.
  (window as any).testBeforeSend = (type: string, payload: any) => {
    if (type === 'error' && payload.error.message === 'hook trips') throw new Error('site hook bug');
    return payload;
  };

  try {
    await import('./index');
    await vi.waitFor(() => expect(sentOfType(fetchMock, 'event')).toHaveLength(1));

    // The site's fetch is untouched (no wrapping).
    expect(window.fetch).toBe(fetchMock);

    const button = document.createElement('button');
    button.id = 'pay';
    button.textContent = 'Pay now';
    document.body.appendChild(button);
    button.click();
    button.remove();

    // Reported, and not cancelled: the browser still logs it and other handlers still run.
    const error = new TypeError('order is undefined');
    const errorEvent = new ErrorEvent('error', { error, message: error.message, cancelable: true });
    window.dispatchEvent(errorEvent);
    expect(errorEvent.defaultPrevented).toBe(false);

    await vi.waitFor(() => expect(sentOfType(fetchMock, 'error')).toHaveLength(1));
    const [{ payload }] = sentOfType(fetchMock, 'error');

    expect(payload.error).toMatchObject({
      type: 'TypeError',
      message: 'order is undefined',
      handled: false,
    });
    expect(payload.error.breadcrumbs.map((b: any) => b.type)).toEqual(['navigation', 'click']);
    expect(payload.error.breadcrumbs[1].message).toBe('button#pay "Pay now"');

    // A circular rejection reason can't make the listener throw.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const rejection = new Event('unhandledrejection', { cancelable: true }) as any;
    rejection.reason = circular;
    expect(() => window.dispatchEvent(rejection)).not.toThrow();
    expect(rejection.defaultPrevented).toBe(false);

    // A throwing site hook doesn't surface as a rejected promise.
    await expect((window as any).ghostwire.error(new Error('hook trips'))).resolves.toBeUndefined();
  } finally {
    delete (window as any).testBeforeSend;
  }
});
