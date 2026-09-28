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

  it('adding the same product in a different size creates a separate line', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    const product = makeProduct({ sizes: ['M', 'L'] });

    act(() => result.current.addItem(product, 'M', 1));
    act(() => result.current.addItem(product, 'L', 1));

    expect(result.current.lines).toHaveLength(2);
    expect(result.current.lines.map((l) => l.size).sort()).toEqual(['L', 'M']);
    expect(result.current.totalItems).toBe(2);
  });

  it('adding the same product and size again increases that line\'s quantity instead of duplicating it', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    const product = makeProduct({ sizes: ['M'] });

    act(() => result.current.addItem(product, 'M', 1));
    act(() => result.current.addItem(product, 'M', 2));

    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0].quantity).toBe(3);
  });

  it('removing one size line does not affect another size line of the same product', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    const product = makeProduct({ sizes: ['M', 'L'], stock: 10 });

    act(() => result.current.addItem(product, 'M', 2));
    act(() => result.current.addItem(product, 'L', 3));
    const mKey = result.current.lines.find((l) => l.size === 'M')!.key;
    act(() => result.current.removeItem(mKey));

    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0]).toMatchObject({ size: 'L', quantity: 3 });
  });

  it('caps the combined quantity across sizes at Product.Stock, not per size', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    const product = makeProduct({ sizes: ['M', 'L'], stock: 5 });

    act(() => result.current.addItem(product, 'M', 3));
    act(() => result.current.addItem(product, 'L', 4)); // 3 + 4 = 7 > stock 5, should cap to +2

    expect(result.current.totalItems).toBe(5);
    expect(result.current.lines.find((l) => l.size === 'L')?.quantity).toBe(2);
  });

  it('remainingStock reflects quantity already reserved across all size lines of a product', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    const product = makeProduct({ sizes: ['M', 'L'], stock: 5 });

    act(() => result.current.addItem(product, 'M', 3));

    expect(result.current.remainingStock(product)).toBe(2);
  });

  it('updateQuantity caps a line at what other size lines of the same product have not already used', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    const product = makeProduct({ sizes: ['M', 'L'], stock: 5 });

    act(() => result.current.addItem(product, 'M', 3));
    act(() => result.current.addItem(product, 'L', 1));
    const lKey = result.current.lines.find((l) => l.size === 'L')!.key;
    act(() => result.current.updateQuantity(lKey, 10)); // only 2 left of stock (5 - 3 for M)

    expect(result.current.lines.find((l) => l.size === 'L')?.quantity).toBe(2);
  });

  it('totalItems (the cart badge) sums quantity across every line, including different sizes', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    const productA = makeProduct({ id: '1', sizes: ['M', 'L'], stock: 10 });
    const productB = makeProduct({ id: '2', sizes: [], stock: 10 });

    act(() => result.current.addItem(productA, 'M', 2));
    act(() => result.current.addItem(productA, 'L', 1));
    act(() => result.current.addItem(productB, null, 4));

    expect(result.current.totalItems).toBe(7);
  });

  it('sizeless products (Category.HasSizes = false) key by productId alone, as before', () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    const product = makeProduct({ sizes: [] });

    act(() => result.current.addItem(product, null, 1));
    act(() => result.current.addItem(product, null, 2));

    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0].quantity).toBe(3);
    expect(result.current.lines[0].size).toBeNull();
  });

  it('migrates a legacy stored cart line missing a key/size without losing its quantity', () => {
    const product = makeProduct({ id: '9', sizes: ['M'] });
    localStorage.setItem(
      'family-shop:cart',
      JSON.stringify([{ product, quantity: 2 }]) // no `key`, no `size` - as an old format would be
    );

    const { result } = renderHook(() => useCart(), { wrapper });

    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0]).toMatchObject({ key: '9__onesize', size: null, quantity: 2 });
    expect(result.current.totalItems).toBe(2);
  });

  it('merges two legacy stored lines that normalize to the same key instead of dropping one', () => {
    const product = makeProduct({ id: '9', sizes: [] });
    localStorage.setItem(
      'family-shop:cart',
      JSON.stringify([
        { product, quantity: 1 },
        { product, size: undefined, quantity: 2 },
      ])
    );

    const { result } = renderHook(() => useCart(), { wrapper });

    expect(result.current.lines).toHaveLength(1);
    expect(result.current.lines[0].quantity).toBe(3);
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
