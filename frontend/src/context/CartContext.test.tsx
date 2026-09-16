import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { CartProvider, useCart } from './CartContext';
import { ToastProvider } from './ToastContext';
import type { Product } from '../types/product';
import { validatePromoCode } from '../lib/api';

vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return { ...actual, validatePromoCode: vi.fn() };
});

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

  it('applies the latest promo code even if its response arrives before an earlier request resolves', async () => {
    const mockValidate = vi.mocked(validatePromoCode);

    let resolveFirst!: (v: Awaited<ReturnType<typeof validatePromoCode>>) => void;
    const firstPromise = new Promise<Awaited<ReturnType<typeof validatePromoCode>>>((resolve) => {
      resolveFirst = resolve;
    });
    mockValidate.mockReturnValueOnce(firstPromise);

    const secondResult = {
      promoCodeId: 2,
      code: 'B',
      discountType: 0 as const,
      discountValue: 10,
      discountAmount: 100,
      finalTotal: 900,
    };
    mockValidate.mockResolvedValueOnce(secondResult);

    const { result } = renderHook(() => useCart(), { wrapper });

    let firstApply!: Promise<void>;
    act(() => {
      firstApply = result.current.applyPromoCode('A');
    });
    let secondApply!: Promise<void>;
    await act(async () => {
      secondApply = result.current.applyPromoCode('B');
      await secondApply;
    });

    // B's response already landed and was applied - now let A's stale response resolve.
    expect(result.current.promo?.code).toBe('B');
    await act(async () => {
      resolveFirst({
        promoCodeId: 1,
        code: 'A',
        discountType: 0,
        discountValue: 5,
        discountAmount: 50,
        finalTotal: 950,
      });
      await firstApply;
    });

    await waitFor(() => expect(result.current.promo?.code).toBe('B'));
  });
});
