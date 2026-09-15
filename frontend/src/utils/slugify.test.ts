import { describe, expect, it } from 'vitest';
import { slugify } from './slugify';

describe('slugify', () => {
  it('transliterates cyrillic to latin and lowercases', () => {
    expect(slugify('Женская одежда')).toBe('zhenskaya-odezhda');
  });

  it('collapses non-alphanumeric runs into a single dash', () => {
    expect(slugify('Hello   World!!')).toBe('hello-world');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('  --Test--  ')).toBe('test');
  });
});
