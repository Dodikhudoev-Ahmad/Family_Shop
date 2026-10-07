import { useTranslation } from 'react-i18next';
import { SITE_NAME } from '../data/seo';
import { useSeo } from './useSeo';

export type NoindexTitleKey =
  | 'cartTitle'
  | 'checkoutTitle'
  | 'accountTitle'
  | 'loginTitle'
  | 'favoritesTitle'
  | 'adminTitle'
  | 'notFoundTitle';

/** Meta for a page that must stay out of search results (cart, checkout, account, login, favorites, admin, 404). */
export function useNoindexSeo(titleKey: NoindexTitleKey) {
  const { t } = useTranslation();
  useSeo({ title: t(`seo.${titleKey}`, { site: SITE_NAME }), description: t('seo.defaultDescription'), noindex: true });
}
