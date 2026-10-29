import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const nav = vi.hoisted(() => ({
  params: new URLSearchParams('q=alice'),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/websites/w1/users',
  useRouter: () => ({ replace: nav.replace }),
  useSearchParams: () => nav.params,
}));
vi.mock('@/components/websites/website-context', () => ({
  useCurrentWebsite: () => ({ id: 'w1', name: 'Shop' }),
}));
vi.mock('@/hooks/queries/users', () => ({
  useWebsiteUsers: () => ({ data: { data: [], count: 0 }, isPending: false }),
}));

const { UsersView } = await import('./users-view');

beforeEach(() => {
  vi.useFakeTimers();
  nav.params = new URLSearchParams('q=alice');
  nav.replace.mockClear();
});
afterEach(() => vi.useRealTimers());

test('Back/Forward to another search shows it instead of writing the old one back', () => {
  const { rerender } = render(<UsersView />);
  const input = screen.getByRole('textbox') as HTMLInputElement;
  expect(input.value).toBe('alice');

  // The browser went back to ?q=bob.
  nav.params = new URLSearchParams('q=bob');
  rerender(<UsersView />);
  act(() => vi.advanceTimersByTime(500));

  expect(input.value).toBe('bob');
  expect(nav.replace).not.toHaveBeenCalled();
});
