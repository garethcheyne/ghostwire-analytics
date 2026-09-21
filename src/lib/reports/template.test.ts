import { describe, expect, it } from 'vitest';
import { niceCeiling } from './template';

describe('niceCeiling', () => {
  it('leaves the peak in the upper part of the plot', () => {
    // The point of the fine steps: a peak of 1,050 against a ceiling of 2,000
    // squashes the whole series into the bottom half of the chart.
    for (const peak of [7, 42, 180, 1050, 4300, 26_000]) {
      const ceiling = niceCeiling(peak);

      expect(ceiling).toBeGreaterThanOrEqual(peak);
      expect(peak / ceiling).toBeGreaterThan(0.5);
    }
  });

  it('gives small counts a readable floor', () => {
    // An axis of 0–1 for a single view reads as a rounding error, not a figure.
    expect(niceCeiling(1)).toBe(5);
    expect(niceCeiling(5)).toBe(5);
  });

  it('rounds to values that divide into clean gridlines', () => {
    // The chart labels 0/25/50/75/100% of the ceiling, so the ceiling has to
    // quarter into numbers a reader recognises.
    expect(niceCeiling(1050)).toBe(1200);
    expect(niceCeiling(830)).toBe(1000);
    expect(niceCeiling(2400)).toBe(2500);
  });
});
