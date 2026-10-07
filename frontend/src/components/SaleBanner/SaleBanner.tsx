import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { maxDiscountPercent } from '../../utils/productFlags';
import type { Product } from '../../types/product';
import './SaleBanner.css';

interface SaleBannerProps {
  products: Product[];
  isLoading: boolean;
}

/**
 * Coloured sale banner of the home page. The "up to N%" line is the biggest real discount in the
 * catalog; with no discounted product there is no sale to announce, so nothing is drawn.
 */
export function SaleBanner({ products, isLoading }: SaleBannerProps) {
  const { t } = useTranslation();
  if (isLoading) {
    return (
      <div className="container">
        <div className="sale-banner sale-banner--loading skeleton" aria-hidden="true" />
      </div>
    );
  }
  const percent = maxDiscountPercent(products);
  if (percent === null) return null;

  return (
    <div className="container">
      <section className="sale-banner" aria-label={t('home.sale.title')}>
        <div className="sale-banner__text">
          <h2 className="sale-banner__title">{t('home.sale.title')}</h2>
          <p className="sale-banner__subtitle">{t('home.sale.upTo', { percent })}</p>
        </div>
        <Link to="/catalog?discount=true" className="sale-banner__cta">
          {t('home.view')}
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="sale-banner__arrow">
            <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </section>
    </div>
  );
}
