import {
  addToCart,
  lineKey,
  parseStoredCart,
  removeLine,
  setQuantity,
  totalItems,
  totalPrice,
  type CartLine,
  type CartProductInfo,
} from '../src/state/cartLogic';

const shirt: CartProductInfo = { id: '7', name: 'Рубашка', price: 5000, stock: 3 };
const lamp: CartProductInfo = { id: '9', name: 'Лампа', price: 2000, stock: 10 };

describe('cart', () => {
  it('one product in two sizes is two separate lines', () => {
    const a = addToCart([], shirt, 'M').lines;
    const b = addToCart(a, shirt, 'L').lines;
    expect(b.map((l) => l.key)).toEqual([lineKey('7', 'M'), lineKey('7', 'L')]);
    expect(totalItems(b)).toBe(2);
  });

  it('the stock cap is per PRODUCT across all its sizes, not per line', () => {
    let lines: CartLine[] = [];
    lines = addToCart(lines, shirt, 'M', 2).lines; // 2 of 3
    const result = addToCart(lines, shirt, 'L', 5); // only 1 left in total
    expect(result.added).toBe(1);
    expect(totalItems(result.lines)).toBe(3);
    expect(addToCart(result.lines, shirt, 'S').added).toBe(0);
  });

  it('raising a line cannot exceed the stock left after the other size lines', () => {
    let lines = addToCart([], shirt, 'M', 2).lines;
    lines = addToCart(lines, shirt, 'L', 1).lines;
    lines = setQuantity(lines, lineKey('7', 'M'), 3);
    expect(lines.find((l) => l.key === lineKey('7', 'M'))?.quantity).toBe(2);
  });

  it('quantity 0 or less removes the line; removeLine works too', () => {
    let lines = addToCart([], lamp, null, 2).lines;
    expect(setQuantity(lines, lineKey('9', null), 0)).toEqual([]);
    lines = removeLine(lines, lineKey('9', null));
    expect(lines).toEqual([]);
  });

  it('products without sizes use the "onesize" key', () => {
    expect(addToCart([], lamp, null).lines[0].key).toBe('9__onesize');
  });

  it('totals use the effective price', () => {
    const lines = addToCart(addToCart([], shirt, 'M', 2).lines, lamp, null, 3).lines;
    expect(totalItems(lines)).toBe(5);
    expect(totalPrice(lines)).toBe(2 * 5000 + 3 * 2000);
  });

  it('survives garbage in storage without crashing, and merges duplicate lines', () => {
    expect(parseStoredCart(null)).toEqual([]);
    expect(parseStoredCart('not json')).toEqual([]);
    expect(parseStoredCart('{"a":1}')).toEqual([]);
    const lines = parseStoredCart(
      JSON.stringify([
        { productId: '7', name: 'A', price: 100, quantity: 1, size: 'M', stock: 5 },
        { productId: '7', name: 'A', price: 100, quantity: 2, size: 'M', stock: 5 },
        { productId: 7, name: 'bad id type', price: 1, quantity: 1 },
        { productId: '8', name: 'B', price: 1, quantity: 0 },
        null,
      ])
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ key: '7__M', quantity: 3 });
  });
});

import { remainingStock } from '../src/state/cartLogic';

describe('remainingStock', () => {
  it('subtracts what ALL size lines of the product already hold', () => {
    const info = { id: '7', name: 'Худи', price: 1000, stock: 5 };
    let lines = addToCart([], info, 'M', 2).lines;
    lines = addToCart(lines, info, 'L', 1).lines;
    expect(remainingStock(lines, '7', 5)).toBe(2);
    expect(remainingStock(lines, '8', 5)).toBe(5);
    expect(remainingStock(lines, '7', 2)).toBe(0);
  });
});

import { reconcileCart } from '../src/state/cartLogic';
import type { Product } from '../src/lib/types';

describe('server limits in the cart (50 units per line, 50 lines)', () => {
  const info = (id: string, stock = 500) => ({ id, name: `p${id}`, price: 100, stock });

  it('a line never holds more than 50 units even with plenty of stock', () => {
    const r = addToCart([], info('1'), 'M', 80);
    expect(r.lines[0].quantity).toBe(50);
    expect(r.added).toBe(50);
    expect(r.limit).toBe('line-quantity');
    expect(addToCart(r.lines, info('1'), 'M', 1)).toMatchObject({ added: 0, limit: 'line-quantity' });
  });

  it('reports the stock as the limit when stock is what ran out', () => {
    expect(addToCart([], info('1', 3), 'M', 5)).toMatchObject({ added: 3, limit: 'stock' });
    expect(addToCart([], info('1', 3), 'M', 2)).toMatchObject({ added: 2, limit: null });
  });

  it('refuses a 51st line, but still tops up an existing one', () => {
    let lines: ReturnType<typeof addToCart>['lines'] = [];
    for (let i = 1; i <= 50; i++) lines = addToCart(lines, info(String(i)), null, 1).lines;
    expect(lines).toHaveLength(50);
    expect(addToCart(lines, info('51'), null, 1)).toMatchObject({ added: 0, limit: 'lines' });
    expect(addToCart(lines, info('7'), null, 1)).toMatchObject({ added: 1, limit: null });
  });

  it('setQuantity respects the 50 cap too', () => {
    const lines = addToCart([], info('1'), 'M', 10).lines;
    expect(setQuantity(lines, lines[0].key, 99)[0].quantity).toBe(50);
  });
});

describe('stored cart normalisation', () => {
  it('drops NaN/negative/zero prices and quantities, clamps quantity, ignores an over-long size', () => {
    const raw = JSON.stringify([
      { productId: '1', name: 'a', price: 10, quantity: 999, size: 'M', stock: 5 },
      { productId: '2', name: 'b', price: Number.NaN, quantity: 1 },
      { productId: '3', name: 'c', price: 10, quantity: 0 },
      { productId: '4', name: 'd', price: -5, quantity: 1 },
      { productId: '5', name: 'e', price: 10, quantity: 1, size: 'x'.repeat(21) },
    ]);
    const lines = parseStoredCart(raw);
    expect(lines.map((l) => [l.productId, l.quantity, l.size])).toEqual([
      ['1', 50, 'M'],
      ['5', 1, null],
    ]);
  });

  it('keeps at most 50 lines of a damaged save', () => {
    const raw = JSON.stringify(Array.from({ length: 70 }, (_, i) => ({ productId: String(i + 1), name: 'n', price: 1, quantity: 1 })));
    expect(parseStoredCart(raw)).toHaveLength(50);
  });
});

describe('reconcileCart (cart vs live catalogue)', () => {
  const product = (id: string, stock: number, price = 1000, discountPrice?: number): Product =>
    ({ id, name: `Live ${id}`, price, discountPrice, stock, images: [`img${id}`], sizes: [] }) as unknown as Product;
  const line = (productId: string, size: string | null, quantity: number, price = 1000, stock = 10) => ({
    key: `${productId}__${size ?? 'onesize'}`, productId, name: 'old', price, size, quantity, stock,
  });

  it('refreshes name, photo, effective price and stock', () => {
    const r = reconcileCart([line('1', 'M', 1, 900)], [product('1', 7, 1200, 1000)]);
    expect(r.lines[0]).toMatchObject({ name: 'Live 1', image: 'img1', price: 1000, stock: 7, quantity: 1 });
    expect(r.changed).toBe(true);
    expect(r.removed).toBe(0);
  });

  it('removes vanished and sold-out products and says how many', () => {
    const r = reconcileCart([line('1', null, 1), line('2', null, 1), line('3', null, 1)], [product('1', 5), product('2', 0)]);
    expect(r.lines.map((l) => l.productId)).toEqual(['1']);
    expect(r.removed).toBe(2);
  });

  it('shares the stock between the size lines of one product', () => {
    const r = reconcileCart([line('1', 'M', 3), line('1', 'L', 3)], [product('1', 4)]);
    expect(r.lines.map((l) => l.quantity)).toEqual([3, 1]);
    const r2 = reconcileCart([line('1', 'M', 4), line('1', 'L', 3)], [product('1', 4)]);
    expect(r2.lines.map((l) => [l.size, l.quantity])).toEqual([['M', 4]]);
    expect(r2.removed).toBe(1);
  });

  it('reports no change when everything already matches', () => {
    const r = reconcileCart([{ ...line('1', null, 2, 1000, 10), name: 'Live 1', image: 'img1' }], [product('1', 10)]);
    expect(r.changed).toBe(false);
  });
});
