import { describe, expect, test } from 'vitest';
import { filterColumn, isFilterColumn, lookupFilterColumn, metricColumn, sqlInteger, sqlTimezone } from './sql-safe';

describe('filter and metric columns', () => {
  test('map known names to their columns', () => {
    expect(filterColumn('path')).toBe('url_path');
    expect(lookupFilterColumn('referrer')).toBe('referrer_domain');
    expect(metricColumn('browser')).toBe('browser');
    expect(metricColumn('screen')).toBe('screen');
    expect(metricColumn('fullPath')).toBe('fullPath');
  });

  test('never resolve Object.prototype keys', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(isFilterColumn(name)).toBe(false);
      expect(lookupFilterColumn(name)).toBeUndefined();
      expect(() => filterColumn(name)).toThrow();
      expect(() => metricColumn(name)).toThrow();
    }
  });

  test('refuse anything else', () => {
    expect(() => metricColumn('(select password from "user")')).toThrow(/Unknown metric type/);
    expect(() => filterColumn('url_path; drop table x')).toThrow(/Unknown column/);
  });
});

describe('sqlInteger', () => {
  test('passes integers and numeric strings, falls back when missing', () => {
    expect(sqlInteger(10, 500)).toBe(10);
    expect(sqlInteger('25', 500)).toBe(25);
    expect(sqlInteger(undefined, 500)).toBe(500);
    expect(sqlInteger('', 0)).toBe(0);
  });

  test('refuses text, fractions and negatives', () => {
    for (const value of ['1 union select 1', '1.5', -1, Number.NaN, Infinity, {}]) {
      expect(() => sqlInteger(value, 0)).toThrow();
    }
  });
});

describe('sqlTimezone', () => {
  test('accepts IANA names and offsets, defaults to UTC', () => {
    expect(sqlTimezone('Europe/London')).toBe('Europe/London');
    expect(sqlTimezone('America/Argentina/Buenos_Aires')).toBe('America/Argentina/Buenos_Aires');
    expect(sqlTimezone('Etc/GMT+5')).toBe('Etc/GMT+5');
    expect(sqlTimezone('+05:30')).toBe('+05:30');
    expect(sqlTimezone(undefined)).toBe('UTC');
    expect(sqlTimezone('utc')).toBe('UTC');
  });

  test('refuses anything that could close the quoted literal', () => {
    expect(() => sqlTimezone("UTC') --")).toThrow();
    expect(() => sqlTimezone('Europe/London; select 1')).toThrow();
  });
});
