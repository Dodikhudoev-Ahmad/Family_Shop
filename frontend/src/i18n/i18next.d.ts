import 'i18next';
import type ru from './locales/ru.json';

// Russian is the source of truth: t('some.key') is checked against it at compile time, so a typo
// or a deleted key fails `tsc` instead of rendering the raw key in the UI.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof ru };
  }
}
