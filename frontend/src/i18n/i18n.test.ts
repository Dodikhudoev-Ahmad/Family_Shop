import { afterEach, describe, expect, it } from 'vitest';
import i18n, { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, setLanguage, dateLocale } from './index';
import ru from './locales/ru.json';
import kk from './locales/kk.json';
import en from './locales/en.json';

type Tree = { [key: string]: string | Tree };

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** Flattens a dictionary into "section.key" paths, folding plural forms into one base key. */
function keysOf(tree: Tree, prefix = ''): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.add(path.replace(PLURAL_SUFFIX, ''));
    else for (const inner of keysOf(v, path)) out.add(inner);
  }
  return out;
}

function leaves(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[path] = v;
    else Object.assign(out, leaves(v, path));
  }
  return out;
}

const placeholders = (text: string) => [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();
const tags = (text: string) => [...text.matchAll(/<\/?(\w+)>/g)].map((m) => m[1]).sort();

afterEach(() => {
  setLanguage('ru');
  localStorage.clear();
});

describe('dictionaries', () => {
  it('kk and en have every key that ru has (and nothing extra)', () => {
    const base = keysOf(ru as Tree);
    for (const [name, dict] of [['kk', kk], ['en', en]] as const) {
      const keys = keysOf(dict as Tree);
      expect([...base].filter((k) => !keys.has(k)), `${name} is missing`).toEqual([]);
      expect([...keys].filter((k) => !base.has(k)), `${name} has extra`).toEqual([]);
    }
  });

  it('keeps the same {{placeholders}} and <tags> as Russian in every translation', () => {
    const base = leaves(ru as Tree);
    for (const [name, dict] of [['kk', kk], ['en', en]] as const) {
      const flat = leaves(dict as Tree);
      for (const [path, text] of Object.entries(flat)) {
        const ruText = base[path] ?? base[path.replace(PLURAL_SUFFIX, '_other')] ?? base[path.replace(PLURAL_SUFFIX, '_one')];
        if (ruText === undefined) continue;
        expect(placeholders(text), `${name}:${path}`).toEqual(placeholders(ruText));
        expect(tags(text), `${name}:${path} tags`).toEqual(tags(ruText));
      }
    }
  });

  it('has no empty translations', () => {
    for (const dict of [ru, kk, en]) {
      expect(Object.entries(leaves(dict as Tree)).filter(([, v]) => v.trim() === '')).toEqual([]);
    }
  });
});

describe('language switching', () => {
  it('starts in Russian and switches instantly, synchronously', () => {
    expect(DEFAULT_LANGUAGE).toBe('ru');
    expect(i18n.t('nav.cart')).toBe('Корзина');
    setLanguage('kk');
    expect(i18n.t('nav.cart')).toBe('Себет');
    expect(i18n.t('nav.favorites')).toBe('Таңдаулылар');
    setLanguage('en');
    expect(i18n.t('nav.cart')).toBe('Cart');
    setLanguage('ru');
    expect(i18n.t('nav.cart')).toBe('Корзина');
  });

  it('remembers the choice and sets <html lang>', () => {
    setLanguage('kk');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('kk');
    expect(document.documentElement.lang).toBe('kk');
    setLanguage('en');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('falls back to Russian for a key missing in the chosen language, never to blank or the raw key', () => {
    i18n.addResource('ru', 'translation', '__probe', 'только по-русски');
    setLanguage('kk');
    expect(i18n.t('__probe' as never)).toBe('только по-русски');
    i18n.addResource('kk', 'translation', '__empty', '');
    i18n.addResource('ru', 'translation', '__empty', 'запасной текст');
    expect(i18n.t('__empty' as never)).toBe('запасной текст');
  });

  it('formats plurals per language', () => {
    expect([1, 2, 5, 21].map((count) => i18n.t('reviews.count', { count }))).toEqual(['1 отзыв', '2 отзыва', '5 отзывов', '21 отзыв']);
    setLanguage('en');
    expect([1, 2].map((count) => i18n.t('reviews.count', { count }))).toEqual(['1 review', '2 reviews']);
    setLanguage('kk');
    expect([1, 5].map((count) => i18n.t('reviews.count', { count }))).toEqual(['1 пікір', '5 пікір']);
  });

  it('keeps prices and numeric dates out of it: only month-name dates follow the language', () => {
    expect(dateLocale()).toBe('ru-RU');
    setLanguage('kk');
    expect(dateLocale()).toBe('kk-KZ');
    setLanguage('en');
    expect(dateLocale()).toBe('en-GB');
  });
});
