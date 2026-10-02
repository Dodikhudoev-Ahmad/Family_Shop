import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n, { setLanguage } from '../i18n';
import { createOrder, updateAdminOrderStatus, ApiError } from './api';
import { isOrderConflict, outOfStockInfo, outOfStockMessage, sizeUnavailableInfo, sizeUnavailableMessage } from './orderErrors';

const envelope = (status: number, body: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }));

const order = { items: [{ productId: 7, quantity: 1, size: null }], contactPhone: '+7 (700) 000-00-00', deliveryMethod: 1 as const };

afterEach(() => {
  vi.restoreAllMocks();
  setLanguage('ru');
});

describe('409 answers of the orders API', () => {
  it('keeps status, code and meta of an out_of_stock failure on the ApiError', async () => {
    envelope(409, {
      success: false,
      errors: ["Insufficient stock for product 'Куртка'."],
      code: 'out_of_stock',
      meta: { productId: 7, productName: 'Куртка', available: 2 },
    });

    const err = await createOrder(order).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(outOfStockInfo(err)).toEqual({ productId: 7, productName: 'Куртка', available: 2 });
    expect(isOrderConflict(err)).toBe(false);
  });

  it('does not treat a plain 400 (validation) or another 409 as out of stock', async () => {
    envelope(400, { success: false, errors: ['Product 5 not found.'] });
    expect(outOfStockInfo(await createOrder(order).catch((e: unknown) => e))).toBeNull();

    vi.restoreAllMocks();
    envelope(409, { success: false, errors: ['x'], code: 'conflict' });
    expect(outOfStockInfo(await createOrder(order).catch((e: unknown) => e))).toBeNull();
  });

  it('recognises a status-change conflict', async () => {
    envelope(409, { success: false, errors: ['changed'], code: 'conflict' });
    expect(isOrderConflict(await updateAdminOrderStatus(1, 4).catch((e: unknown) => e))).toBe(true);
  });
});

describe('out-of-stock message', () => {
  const info = { productId: 7, productName: 'Куртка', available: 2 };

  it.each([
    ['ru', 'Товара «Куртка» не хватает на складе, осталось 2'],
    ['en', 'Not enough of “Куртка” in stock, only 2 left'],
    ['kk', '«Куртка» тауары қоймада жеткіліксіз, 2 дана қалды'],
  ])('names the product and the remaining quantity in %s', (lang, expected) => {
    setLanguage(lang as 'ru' | 'en' | 'kk');
    expect(outOfStockMessage(info, i18n.t.bind(i18n))).toContain(expected);
  });

  it('says the product is gone when nothing is left', () => {
    expect(outOfStockMessage({ ...info, available: 0 }, i18n.t.bind(i18n))).toContain('закончился');
  });

  it('has the order-changed text in all three languages', () => {
    for (const lang of ['ru', 'kk', 'en'] as const) {
      setLanguage(lang);
      expect(i18n.t('errors.orderChanged').length).toBeGreaterThan(10);
    }
  });
});

describe('size_unavailable', () => {
  it('is read from the 409 envelope', async () => {
    envelope(409, { success: false, errors: ['x'], code: 'size_unavailable', meta: { productId: 7, productName: 'Куртка', size: 'XL' } });
    const err = await createOrder(order).catch((e: unknown) => e);

    expect(sizeUnavailableInfo(err)).toEqual({ productName: 'Куртка', size: 'XL' });
    expect(outOfStockInfo(err)).toBeNull();
  });

  it.each([
    ['ru', 'Размер «XL» товара «Куртка» больше недоступен'],
    ['en', 'Size “XL” of “Куртка” is no longer available'],
    ['kk', '«Куртка» тауарының «XL» өлшемі енді қолжетімсіз'],
  ])('names the product and size in %s', (lang, expected) => {
    setLanguage(lang as 'ru' | 'en' | 'kk');
    expect(sizeUnavailableMessage({ productName: 'Куртка', size: 'XL' }, i18n.t.bind(i18n))).toContain(expected);
  });

  it('asks for a size when none was sent', () => {
    expect(sizeUnavailableMessage({ productName: 'Куртка', size: null }, i18n.t.bind(i18n))).toContain('нужно выбрать размер');
  });
});
