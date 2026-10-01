import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n, { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, restoreLanguage, setLanguage } from '../src/i18n';
import en from '../src/i18n/locales/en.json';
import kk from '../src/i18n/locales/kk.json';
import ru from '../src/i18n/locales/ru.json';

type Tree = { [key: string]: string | Tree };
const PLURAL = /_(zero|one|two|few|many|other)$/;

function keysOf(tree: Tree, prefix = ''): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.add(path.replace(PLURAL, ''));
    else keysOf(v, path).forEach((x) => out.add(x));
  }
  return out;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  await i18n.changeLanguage('ru');
});

describe('dictionaries', () => {
  it('kk and en have every key ru has, and nothing extra', () => {
    const base = keysOf(ru as Tree);
    for (const dict of [kk, en]) {
      const keys = keysOf(dict as Tree);
      expect([...base].filter((k) => !keys.has(k))).toEqual([]);
      expect([...keys].filter((k) => !base.has(k))).toEqual([]);
    }
  });

  it('includes the mobile-only strings in all three languages', () => {
    for (const dict of [ru, kk, en]) {
      expect(dict.mobile.retry.length).toBeGreaterThan(0);
      expect(dict.mobile.themeDark.length).toBeGreaterThan(0);
    }
  });
});

describe('language', () => {
  it('defaults to Russian regardless of the device', () => {
    expect(DEFAULT_LANGUAGE).toBe('ru');
    expect(i18n.t('nav.cart')).toBe('Корзина');
  });

  it('switches and is remembered in AsyncStorage (a preference, not a secret)', async () => {
    await setLanguage('kk');
    expect(i18n.t('nav.cart')).toBe('Себет');
    expect(await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('kk');
  });

  it('restores the saved language at startup, and ignores a corrupted value', async () => {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    await restoreLanguage();
    expect(i18n.language).toBe('en');

    await i18n.changeLanguage('ru');
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
    await restoreLanguage();
    expect(i18n.language).toBe('ru');
  });

  it('falls back to Russian for a key missing in the chosen language', async () => {
    i18n.addResource('ru', 'translation', '__probe', 'только по-русски');
    await i18n.changeLanguage('kk');
    expect(i18n.t('__probe' as never)).toBe('только по-русски');
  });

  it('formats plurals per language', async () => {
    expect([1, 2, 5].map((count) => i18n.t('reviews.count', { count }))).toEqual(['1 отзыв', '2 отзыва', '5 отзывов']);
    await i18n.changeLanguage('en');
    expect([1, 2].map((count) => i18n.t('reviews.count', { count }))).toEqual(['1 review', '2 reviews']);
  });
});
