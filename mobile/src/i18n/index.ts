import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import kk from './locales/kk.json';
import ru from './locales/ru.json';

export const LANGUAGES = ['ru', 'kk', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Default is Russian - deliberately not taken from the device locale, same as the website. */
export const DEFAULT_LANGUAGE: Language = 'ru';
/** The language is a preference, not a secret, so AsyncStorage is the right place for it. */
export const LANGUAGE_STORAGE_KEY = 'fs.lang.v2';
/** Pre-v2 key: values saved by earlier builds (e.g. "en" picked while testing) are dropped, not restored. */
export const LEGACY_LANGUAGE_STORAGE_KEY = 'fs.lang';

export const LANGUAGE_META: Record<Language, { code: string; name: string }> = {
  ru: { code: 'RU', name: 'Русский' },
  kk: { code: 'KZ', name: 'Қазақша' },
  en: { code: 'EN', name: 'English' },
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

void i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, kk: { translation: kk }, en: { translation: en } },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE, // a key missing in kk/en shows Russian, never a blank
  returnEmptyString: false,
  interpolation: { escapeValue: false }, // React Native does not interpret markup
  react: { useSuspense: false },
});

/** Applies the saved language (if any). Call once at startup. */
export async function restoreLanguage(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LEGACY_LANGUAGE_STORAGE_KEY);
    const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguage(stored) && stored !== i18n.language) {
      await i18n.changeLanguage(stored);
    }
  } catch {
    // storage unreadable - keep the default
  }
}

export async function setLanguage(language: Language): Promise<void> {
  await i18n.changeLanguage(language);
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // the switch still applies for this session
  }
}

export default i18n;
