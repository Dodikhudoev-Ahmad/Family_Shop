import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { CartProvider, useCart } from './CartContext';
import { ToastProvider } from './ToastContext';
import type { Product } from '../types/product';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: '1',
    name: 'Тестовый товар',
    description: '',
    price: 1000,
    stock: 3,
    categoryId: 'cat-1',
    gender: 'female',
    images: [],
    sizes: ['M'],
    createdAt: new Date().toISOString(),
    averageRating: 0,
    reviewCount: 0,
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <CartProvider>{children}</CartProvider>
    </ToastProvider>
  );
}

describe('CartContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adds an item to the cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => result.current.addItem(makeProduct(), 'M', 2));

    expect(result.current.totalItems).toBe(2);
    expect(result.current.lines).toHaveLength(1);
  });

  it('caps quantity added at available stock', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => result.current.addItem(makeProduct({ stock: 2 }), 'M', 5));

    expect(result.current.totalItems).toBe(2);
  });

  it('removes an item from the cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => result.current.addItem(makeProduct(), 'M', 1));
    const key = result.current.lines[0].key;
    act(() => result.current.removeItem(key));

    expect(result.current.lines).toHaveLength(0);
    expect(result.current.totalItems).toBe(0);
  });

  it('recalculates the total price using the discount price when present', () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => result.current.addItem(makeProduct({ price: 1000, discountPrice: 800 }), 'M', 2));

    expect(result.current.totalPrice).toBe(1600);
  });
});
