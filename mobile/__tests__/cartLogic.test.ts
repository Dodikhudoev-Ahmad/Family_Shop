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
