import { describe, expect, it } from 'vitest';
import { safeNext } from './auth-heading';

describe('safeNext', () => {
  it('keeps paths on this site', () => {
    expect(safeNext('/websites/abc?x=1')).toBe('/websites/abc?x=1');
    expect(safeNext('/')).toBe('/');
  });

  it.each([undefined, '', 'https://evil.test', '//evil.test', '/\\evil.test', '/\\/evil.test', 'evil', '/x\n/y', '/\t/evil.test'])(
    'sends %j to the websites list instead',
    next => expect(safeNext(next)).toBe('/websites'),
  );
});
