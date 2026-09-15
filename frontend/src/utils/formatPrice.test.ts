import { describe, expect, it } from 'vitest';
import { formatPrice } from './formatPrice';

describe('formatPrice', () => {
  it('formats a whole number as KZT currency', () => {
    expect(formatPrice(5000)).toContain('5');
    expect(formatPrice(5000)).toContain('₸');
  });

  it('rounds to no fraction digits', () => {
    expect(formatPrice(1500.75)).not.toMatch(/[.,]\d+/);
  });

  it('formats zero', () => {
    expect(formatPrice(0)).toContain('0');
  });
});
