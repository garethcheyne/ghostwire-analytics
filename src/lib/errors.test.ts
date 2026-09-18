import { describe, expect, it } from 'vitest';
import { getCulprit, getFingerprint, isNoise, normalizeMessage, parseStack } from './errors';

const chromeStack = `TypeError: Cannot read properties of undefined (reading 'total')
    at submitOrder (https://shop.example.com/assets/checkout-3f9a1c2b.js:120:15)
    at async HTMLButtonElement.onClick (https://shop.example.com/assets/checkout-3f9a1c2b.js:88:5)
    at https://shop.example.com/node_modules/react-dom/cjs/react-dom.js:4000:14`;

const firefoxStack = `submitOrder@https://shop.example.com/assets/checkout.js:120:15
onClick@https://shop.example.com/assets/checkout.js:88:5
@https://shop.example.com/assets/app.js:1:1`;

const nodeStack = `Error: connect ECONNREFUSED 127.0.0.1:5432
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1606:16)
    at Pool.connect (/app/node_modules/pg-pool/index.js:45:11)
    at getOrder (/app/src/orders.ts:31:18)`;

const pythonStack = `Traceback (most recent call last):
  File "/usr/lib/python3.12/site-packages/starlette/routing.py", line 74, in app
    response = await func(request)
  File "/app/orders/views.py", line 42, in checkout
    total = order.total
AttributeError: 'NoneType' object has no attribute 'total'`;

const dotnetStack = `System.NullReferenceException: Object reference not set to an instance of an object.
   at Shop.Orders.OrderService.Submit(Order order) in C:\\src\\Shop\\Orders\\OrderService.cs:line 42
   at Microsoft.AspNetCore.Mvc.Infrastructure.ActionMethodExecutor.Execute()`;

describe('parseStack', () => {
  it('parses V8 frames, marking library frames as not in-app', () => {
    const frames = parseStack(chromeStack, 'javascript');

    expect(frames).toHaveLength(3);
    expect(frames[0]).toEqual({
      file: 'https://shop.example.com/assets/checkout-3f9a1c2b.js',
      function: 'submitOrder',
      line: 120,
      column: 15,
      inApp: true,
    });
    expect(frames[1].function).toBe('HTMLButtonElement.onClick');
    expect(frames[2]).toMatchObject({ function: null, inApp: false });
  });

  it('parses Firefox / Safari frames', () => {
    const frames = parseStack(firefoxStack, 'javascript');

    expect(frames.map(frame => frame.function)).toEqual(['submitOrder', 'onClick', null]);
    expect(frames[0]).toMatchObject({ line: 120, column: 15 });
  });

  it('treats Node internals and node_modules as library code', () => {
    const frames = parseStack(nodeStack, 'node');

    expect(frames.map(frame => frame.inApp)).toEqual([false, false, true]);
    expect(frames[2]).toMatchObject({ file: '/app/src/orders.ts', function: 'getOrder' });
  });

  it('parses Python tracebacks most recent call first', () => {
    const frames = parseStack(pythonStack, 'python');

    expect(frames).toEqual([
      { file: '/app/orders/views.py', function: 'checkout', line: 42, column: null, inApp: true },
      {
        file: '/usr/lib/python3.12/site-packages/starlette/routing.py',
        function: 'app',
        line: 74,
        column: null,
        inApp: false,
      },
    ]);
  });

  it('parses .NET frames, with and without file info', () => {
    const frames = parseStack(dotnetStack, 'csharp');

    expect(frames[0]).toMatchObject({
      file: 'C:\\src\\Shop\\Orders\\OrderService.cs',
      function: 'Shop.Orders.OrderService.Submit(Order order)',
      line: 42,
      inApp: true,
    });
    expect(frames[1]).toMatchObject({ line: null, inApp: false });
  });

  it('returns no frames for an empty stack', () => {
    expect(parseStack(undefined, 'javascript')).toEqual([]);
  });
});

describe('getCulprit', () => {
  it('names the most recent in-app frame', () => {
    expect(getCulprit(parseStack(nodeStack, 'node'))).toBe('orders.ts in getOrder');
    expect(getCulprit(parseStack(pythonStack, 'python'))).toBe('views.py in checkout');
    expect(getCulprit([])).toBeNull();
    // Inline page scripts are named after the page.
    expect(
      getCulprit(parseStack('at applyCoupon (https://shop.example.com/cart/:12:9)', 'javascript')),
    ).toBe('/cart/ in applyCoupon');
  });
});

describe('normalizeMessage', () => {
  it('replaces values that change between occurrences', () => {
    expect(normalizeMessage(`Order 1234 not found for 'jane@acme.io' at https://x.io/a?b=1`)).toBe(
      'Order <num> not found for <str> at <url>',
    );
    expect(normalizeMessage('id 0b9d6f0e-1c2a-4f3b-9d8e-7a6b5c4d3e2f missing')).toBe(
      'id <uuid> missing',
    );
  });
});

describe('getFingerprint', () => {
  const frames = parseStack(chromeStack, 'javascript');

  it('groups occurrences that differ only in values and line numbers', () => {
    const moved = parseStack(chromeStack.replace(':120:15', ':131:9'), 'javascript');

    expect(getFingerprint('TypeError', 'Order 12 failed', frames)).toBe(
      getFingerprint('TypeError', 'Order 99 failed', moved),
    );
  });

  it('keeps the group across deploys that change a hashed bundle name', () => {
    const redeployed = parseStack(chromeStack.replaceAll('3f9a1c2b', 'aa77bb99'), 'javascript');

    expect(getFingerprint('TypeError', 'x', frames)).toBe(
      getFingerprint('TypeError', 'x', redeployed),
    );
  });

  it('separates different error types and locations', () => {
    const other = parseStack(nodeStack, 'node');

    expect(getFingerprint('TypeError', 'x', frames)).not.toBe(
      getFingerprint('RangeError', 'x', frames),
    );
    expect(getFingerprint('TypeError', 'x', frames)).not.toBe(
      getFingerprint('TypeError', 'x', other),
    );
  });
});

describe('isNoise', () => {
  it('drops unactionable browser errors', () => {
    expect(isNoise('Script error.', [])).toBe(true);
    expect(isNoise('ResizeObserver loop limit exceeded', [])).toBe(true);
    expect(
      isNoise('boom', parseStack('at x (chrome-extension://abc/content.js:1:1)', 'javascript')),
    ).toBe(true);
    expect(isNoise('boom', parseStack(chromeStack, 'javascript'))).toBe(false);
  });
});
