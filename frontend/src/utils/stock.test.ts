import { describe, expect, it } from 'vitest';
import { isLowStock, isOutOfStock, LOW_STOCK_THRESHOLD } from './stock';

describe('isLowStock', () => {
  it('is true when stock is between 1 and the threshold', () => {
    expect(isLowStock(1)).toBe(true);
    expect(isLowStock(LOW_STOCK_THRESHOLD)).toBe(true);
  });

  it('is false above the threshold', () => {
    expect(isLowStock(LOW_STOCK_THRESHOLD + 1)).toBe(false);
  });

  it('is false when out of stock', () => {
    expect(isLowStock(0)).toBe(false);
  });
});

describe('isOutOfStock', () => {
  it('is true for zero or negative stock', () => {
    expect(isOutOfStock(0)).toBe(true);
    expect(isOutOfStock(-1)).toBe(true);
  });

  it('is false for positive stock', () => {
    expect(isOutOfStock(1)).toBe(false);
  });
});
