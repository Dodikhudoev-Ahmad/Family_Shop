import 'i18next';
import type ru from './locales/ru.json';

// Russian is the source of truth: t('some.key') is checked against it at compile time.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof ru };
  }
}
