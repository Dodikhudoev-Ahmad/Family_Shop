import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ru from './locales/ru.json';
import kk from './locales/kk.json';
import en from './locales/en.json';

export const LANGUAGES = ['ru', 'kk', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_LANGUAGE: Language = 'ru';
export const LANGUAGE_STORAGE_KEY = 'family-shop:lang';

/** Short code on the switcher button and the full native name in its menu. */
export const LANGUAGE_META: Record<Language, { code: string; name: string }> = {
  ru: { code: 'RU', name: 'Русский' },
  kk: { code: 'KZ', name: 'Қазақша' },
  en: { code: 'EN', name: 'English' },
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** Saved choice, else Russian - deliberately not sniffed from the browser. */
function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // storage blocked (private mode) - fall through to the default
  }
  return DEFAULT_LANGUAGE;
}

// All three dictionaries ship in the main bundle (~15 KB each): switching is then a synchronous
// state change with no network round trip, so it can never hang or flash untranslated text.
void i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, kk: { translation: kk }, en: { translation: en } },
  lng: initialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE, // a key missing in kk/en shows the Russian text, never a blank
  returnEmptyString: false, // an empty translation counts as missing and falls back too
  interpolation: { escapeValue: false }, // React escapes already
  react: { useSuspense: false },
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
  } catch {
    // ignore storage errors
  }
});
document.documentElement.lang = i18n.language;

export function setLanguage(lang: Language) {
  void i18n.changeLanguage(lang);
}

/** Locale for date words (month names) - numeric dates and prices keep their fixed format. */
export function dateLocale(): string {
  const lang = i18n.language;
  return lang === 'kk' ? 'kk-KZ' : lang === 'en' ? 'en-GB' : 'ru-RU';
}

export default i18n;
