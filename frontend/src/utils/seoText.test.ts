import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import { SITE_NAME } from '../data/seo';
import type { Product } from '../types/product';
import { categorySeoText, productSeoText } from './seoText';

const t = i18next.t.bind(i18next);
const product = (over: Partial<Product> = {}): Product => ({
  id: '7',
  name: 'Платье летнее',
  description: 'Лёгкое платье из хлопка.',
  price: 12500,
  stock: 3,
  categoryId: '1',
  gender: 'female',
  images: [],
  sizes: [],
  createdAt: '2026-01-01T00:00:00Z',
  averageRating: 0,
  reviewCount: 0,
  ...over,
});

describe('productSeoText', () => {
  it('title: «{name} — {price} | Family Shop»; description: the product description', () => {
    const r = productSeoText(t, product());
    expect(r.title).toMatch(/^Платье летнее — 12\s500\s₸ \| Family Shop$/);
    expect(r.description).toBe('Лёгкое платье из хлопка.');
  });

  it('uses the discounted price in the title', () => {
    expect(productSeoText(t, product({ discountPrice: 9900 })).title).toMatch(/9\s900\s₸/);
  });

  it('keeps the title within 60 characters by cutting the name, never the price or the site', () => {
    const r = productSeoText(t, product({ name: 'Очень длинное название товара '.repeat(6) }));
    expect(r.title.length).toBeLessThanOrEqual(60);
    expect(r.title).toMatch(/…\s—\s12\s500\s₸ \| Family Shop$/);
  });

  it('description: at most 150 characters; empty description falls back to the template', () => {
    expect(productSeoText(t, product({ description: 'слово '.repeat(60) })).description.length).toBeLessThanOrEqual(150);
    expect(productSeoText(t, product({ description: '   ' })).description).toBe(
      'Платье летнее в интернет-магазине Family Shop. Доставка по Казахстану.',
    );
  });
});

describe('categorySeoText', () => {
  it('title: «{category} — купить в Казахстане | Family Shop»', () => {
    expect(categorySeoText(t, 'Женское', []).title).toBe('Женское — купить в Казахстане | Family Shop');
  });

  it('description: count (Russian plural) and the lowest effective price', () => {
    const list = [product({ price: 15000 }), product({ price: 20000, discountPrice: 8000 }), product({ price: 12000 })];
    expect(categorySeoText(t, 'Женское', list).description).toMatch(
      /^Женское: 3 товара в Family Shop\. Цены от 8\s000\s₸, быстрая доставка по Казахстану\.$/,
    );
    expect(categorySeoText(t, 'Женское', [product()]).description).toMatch(/: 1 товар в /);
    expect(categorySeoText(t, 'Женское', Array(5).fill(product())).description).toMatch(/: 5 товаров в /);
  });

  it('while the list is empty (loading) falls back to the generic text without numbers', () => {
    const d = categorySeoText(t, 'Женское', []).description;
    expect(d).toBe(
      'Каталог «Женское» в интернет-магазине Family Shop: широкий выбор, актуальные цены и быстрая доставка по Казахстану.',
    );
  });

  it('site name used in the templates is the brand name', () => {
    expect(SITE_NAME).toBe('Family Shop');
  });
});
