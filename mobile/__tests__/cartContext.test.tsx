import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { ApiError } from '../src/lib/api/errors';
import type { PromoCodeApplicationDto } from '../src/lib/api/types';
import type { Product } from '../src/lib/types';
import { CART_STORAGE_KEY, CartProvider, useCart } from '../src/state/CartContext';

jest.mock('../src/state/ProductsContext', () => ({ useProducts: jest.fn() }));
jest.mock('../src/lib/api/endpoints', () => ({ validatePromoCode: jest.fn() }));

const { useProducts } = jest.requireMock<{ useProducts: jest.Mock }>('../src/state/ProductsContext');
const { validatePromoCode } = jest.requireMock<{ validatePromoCode: jest.Mock<Promise<PromoCodeApplicationDto>, [string, number]> }>('../src/lib/api/endpoints');

const product = (id: string, stock: number, price = 1000, discountPrice?: number): Product =>
  ({ id, name: `Товар ${id}`, price, discountPrice, stock, images: [`img${id}`], sizes: [] }) as unknown as Product;
const info = (id: string, stock: number, price = 1000) => ({ id, name: `Товар ${id}`, price, stock });

type Cart = ReturnType<typeof useCart>;
async function mount(catalogue: Product[] = []) {
  useProducts.mockReturnValue({ products: catalogue, isLoading: false, error: null, reload: jest.fn() });
  const ref: { current: Cart | null } = { current: null };
  const Probe = () => {
    ref.current = useCart();
    return null;
  };
  await act(async () => {
    create(
      <CartProvider>
        <Probe />
      </CartProvider>
    );
  });
  return ref;
}
const cart = (ref: { current: Cart | null }): Cart => {
  if (!ref.current) throw new Error('not mounted');
  return ref.current;
};

beforeEach(async () => {
  await AsyncStorage.clear();
  validatePromoCode.mockReset();
});

describe('CartContext - lines', () => {
  it('one product in two sizes is two lines with a shared stock cap', async () => {
    const ref = await mount();
    act(() => { cart(ref).addItem(info('1', 4), 'M', 3); });
    let second = { added: -1, limit: null as string | null };
    act(() => { second = cart(ref).addItem(info('1', 4), 'L', 3); });
    expect(second).toEqual({ added: 1, limit: 'stock' });
    expect(cart(ref).lines.map((l) => [l.size, l.quantity])).toEqual([['M', 3], ['L', 1]]);
    expect(cart(ref).totalItems).toBe(4);
  });

  it('+/- on a line cannot exceed what the other sizes leave, removing works', async () => {
    const ref = await mount();
    act(() => { cart(ref).addItem(info('1', 5), 'M', 2); });
    act(() => { cart(ref).addItem(info('1', 5), 'L', 1); });
    const l = cart(ref).lines.find((x) => x.size === 'L');
    act(() => cart(ref).setQuantity(l?.key ?? '', 10));
    expect(cart(ref).lines.find((x) => x.size === 'L')?.quantity).toBe(3);
    act(() => cart(ref).removeItem(l?.key ?? ''));
    expect(cart(ref).lines).toHaveLength(1);
  });

  it('totals use the effective price', async () => {
    const ref = await mount();
    act(() => { cart(ref).addItem(info('1', 5, 800), null, 2); });
    expect(cart(ref).totalPrice).toBe(1600);
    expect(cart(ref).finalTotal).toBe(1600);
  });
});

describe('CartContext - persistence', () => {
  it('saves every change and restores it on the next start', async () => {
    const first = await mount();
    act(() => { cart(first).addItem(info('7', 9), 'M', 2); });
    await act(async () => { await Promise.resolve(); });
    const saved = await AsyncStorage.getItem(CART_STORAGE_KEY);
    expect(saved).toContain('"productId":"7"');

    const second = await mount();
    expect(cart(second).lines.map((l) => [l.productId, l.size, l.quantity])).toEqual([['7', 'M', 2]]);
  });

  it('survives a damaged save and does not wipe it before it was read', async () => {
    await AsyncStorage.setItem(CART_STORAGE_KEY, '{not json');
    const ref = await mount();
    expect(cart(ref).lines).toEqual([]);

    await AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify([{ productId: '3', name: 'x', price: 5, quantity: 2, size: null, stock: 9 }]));
    const again = await mount();
    expect(cart(again).lines).toHaveLength(1);
  });

  it('migrates an old save: rebuilds the key, merges duplicates, drops garbage', async () => {
    await AsyncStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([
        { productId: '1', name: 'a', price: 10, quantity: 1, stock: 9 },
        { productId: '1', name: 'a', price: 10, quantity: 2, size: '', stock: 9 },
        { nonsense: true },
        null,
      ])
    );
    const ref = await mount();
    expect(cart(ref).lines).toHaveLength(1);
    expect(cart(ref).lines[0]).toMatchObject({ key: '1__onesize', quantity: 3, size: null });
  });
});

describe('CartContext - catalogue reconciliation', () => {
  it('on start, refreshes prices/stock and removes sold-out products with a notice', async () => {
    await AsyncStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([
        { productId: '1', name: 'old', price: 500, quantity: 2, size: null, stock: 9 },
        { productId: '2', name: 'gone', price: 500, quantity: 1, size: null, stock: 9 },
      ])
    );
    const ref = await mount([product('1', 10, 1200, 1000), product('2', 0)]);
    expect(cart(ref).lines).toHaveLength(1);
    expect(cart(ref).lines[0]).toMatchObject({ name: 'Товар 1', price: 1000, stock: 10 });
    expect(cart(ref).removedNotice).toBe(1);
    act(() => cart(ref).dismissRemovedNotice());
    expect(cart(ref).removedNotice).toBe(0);
  });
});

describe('CartContext - promo code', () => {
  const application = (code: string, finalTotal: number): PromoCodeApplicationDto => ({ promoCodeId: 1, code, discountType: 0, discountValue: 10, discountAmount: 100, finalTotal });

  it('asks the server for the discount (the client never computes it) and shows its final total', async () => {
    const ref = await mount();
    act(() => { cart(ref).addItem(info('1', 9, 1000), null, 1); });
    validatePromoCode.mockResolvedValue(application('SALE10', 900));
    await act(async () => cart(ref).applyPromoCode(' SALE10 '));
    expect(validatePromoCode).toHaveBeenCalledWith('SALE10', 1000);
    expect(cart(ref).promo?.code).toBe('SALE10');
    expect(cart(ref).finalTotal).toBe(900);
    expect(cart(ref).totalPrice).toBe(1000);
  });

  it('shows the server message for a bad code and keeps no discount', async () => {
    const ref = await mount();
    act(() => { cart(ref).addItem(info('1', 9), null, 1); });
    validatePromoCode.mockRejectedValue(new ApiError(400, 'Promo code is expired.'));
    await act(async () => cart(ref).applyPromoCode('OLD'));
    expect(cart(ref).promoError).toBe('Promo code is expired.');
    expect(cart(ref).promo).toBeNull();
  });

  it('drops the discount as soon as the cart changes (it was computed for another subtotal), and on clear', async () => {
    const ref = await mount();
    act(() => { cart(ref).addItem(info('1', 9, 1000), null, 1); });
    validatePromoCode.mockResolvedValue(application('SALE10', 900));
    await act(async () => cart(ref).applyPromoCode('SALE10'));
    act(() => { cart(ref).addItem(info('1', 9, 1000), null, 1); });
    expect(cart(ref).promo).toBeNull();
    expect(cart(ref).finalTotal).toBe(2000);

    await act(async () => cart(ref).applyPromoCode('SALE10'));
    expect(cart(ref).promo).not.toBeNull();
    act(() => cart(ref).clear());
    expect(cart(ref).promo).toBeNull();
    expect(cart(ref).lines).toEqual([]);
  });

  it('an over-long code never reaches the server', async () => {
    const ref = await mount();
    await act(async () => cart(ref).applyPromoCode('X'.repeat(51)));
    expect(validatePromoCode).not.toHaveBeenCalled();
    expect(cart(ref).promoError).not.toBeNull();
  });
});
