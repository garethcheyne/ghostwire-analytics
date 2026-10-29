import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { QueryError } from './query-error';

test("shows the request's error, not an empty state", () => {
  render(<QueryError error={new Error('Website not found.')} />);
  expect(screen.getByText("Couldn't load this")).toBeTruthy();
  expect(screen.getByText('Website not found.')).toBeTruthy();
});

test('falls back to a generic message', () => {
  render(<QueryError error={{}} />);
  expect(screen.getByText('Something went wrong.')).toBeTruthy();
});
