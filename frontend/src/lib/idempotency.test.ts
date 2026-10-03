import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOrder } from './api';
import { createIdempotencyKeyHolder, newIdempotencyKey } from './idempotency';

afterEach(() => vi.restoreAllMocks());

describe('newIdempotencyKey', () => {
  it('is a UUID the server accepts (8-100 URL-safe characters), different every time', () => {
    const a = newIdempotencyKey();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).toMatch(/^[A-Za-z0-9._:-]{8,100}$/);
    expect(newIdempotencyKey()).not.toBe(a);
  });
});

describe('createIdempotencyKeyHolder', () => {
  const counter = () => {
    let n = 0;
    return () => `key-${++n}-padding`;
  };

  it('opens with a key and keeps it for the same request (double tap, retry after a lost answer or a refusal)', () => {
    const holder = createIdempotencyKeyHolder(counter());

    const first = holder.keyFor('body-A');
    expect(first).toBe('key-1-padding'); // the one made when checkout opened
    expect(holder.keyFor('body-A')).toBe(first);
    expect(holder.keyFor('body-A')).toBe(first);
  });

  it('takes a new key when the body changes (cart, promo, phone, address) - the server refuses a key reused with another body', () => {
    const holder = createIdempotencyKeyHolder(counter());
    const a = holder.keyFor('body-A');

    const b = holder.keyFor('body-B');

    expect(b).not.toBe(a);
    expect(holder.keyFor('body-B')).toBe(b);
    expect(holder.keyFor('body-A')).not.toBe(b); // going back is a change too: never a stale key for a different body
  });

  it('takes a new key after the order was placed', () => {
    const holder = createIdempotencyKeyHolder(counter());
    const first = holder.keyFor('body-A');

    holder.reset();

    expect(holder.keyFor('body-A')).not.toBe(first);
  });
});

describe('createOrder', () => {
  const request = { items: [{ productId: 1, quantity: 1, size: null }], contactPhone: '+7 700 000 00 00', deliveryMethod: 1 as const };
  const ok = () => vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true, data: { id: 5 }, errors: [] }), { status: 200 }));

  it('sends the key as the Idempotency-Key header', async () => {
    const spy = ok();

    await createOrder(request, 'abcd1234-key');

    const headers = new Headers((spy.mock.calls[0][1] as RequestInit).headers);
    expect(headers.get('Idempotency-Key')).toBe('abcd1234-key');
  });

  it('sends no such header without a key', async () => {
    const spy = ok();

    await createOrder(request);

    expect(new Headers((spy.mock.calls[0][1] as RequestInit).headers).has('Idempotency-Key')).toBe(false);
  });
});
