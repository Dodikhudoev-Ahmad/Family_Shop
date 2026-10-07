import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { discountPercentOf, maxDiscountPercent, saleCollage } from '../../utils/productFlags';
import type { Product } from '../../types/product';
import './SaleBanner.css';

interface SaleBannerProps {
  products: Product[];
  isLoading: boolean;
}

// Intrinsic size hint of the collage photos (the card is 7:9); CSS scales them, the hint keeps layout stable.
const CARD_PHOTO_WIDTH = 112;
const CARD_PHOTO_HEIGHT = 144;

const SPARKLE = 'M0 -10 C1 -3 3 -1 10 0 C3 1 1 3 0 10 C-1 3 -3 1 -10 0 C-3 -1 -1 -3 0 -10Z';

/** Own decoration (sparkles, circles, a blob), coloured by the --promo-decor token; never carries meaning. */
function Decor() {
  return (
    <svg className="sale-banner__decor" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <circle cx="372" cy="-6" r="70" opacity="0.1" />
      <circle cx="-14" cy="196" r="58" opacity="0.08" />
      <path d="M250 214 C238 168 292 140 338 150 C392 162 410 214 392 236 L262 236 Z" opacity="0.1" />
      <circle cx="214" cy="38" r="5" opacity="0.28" />
      <circle cx="176" cy="172" r="3.5" opacity="0.22" />
      <circle cx="388" cy="118" r="4" opacity="0.26" />
      <path d={SPARKLE} transform="translate(236 26) scale(1.3)" opacity="0.5" />
      <path d={SPARKLE} transform="translate(160 150) scale(0.8)" opacity="0.35" />
      <path d={SPARKLE} transform="translate(374 84) scale(1)" opacity="0.4" />
    </svg>
  );
}

/**
 * Coloured sale banner of the home page. The "до −N%" line is the biggest real discount in the
 * catalog and the collage shows the products behind it; with no discounted product there is no sale
 * to announce, so nothing is drawn.
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
  const collage = saleCollage(products);

  return (
    <div className="container">
      <section className="sale-banner" aria-label={t('home.sale.title')}>
        <Decor />
        <div className="sale-banner__text">
          <h2 className="sale-banner__title">{t('home.sale.title')}</h2>
          <p className="sale-banner__upto">{t('home.sale.upTo', { percent })}</p>
          <Link to="/catalog?discount=true" className="sale-banner__cta">
            {t('home.view')}
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="sale-banner__arrow">
              <path d="M4 10h12M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
        {collage.length > 0 && (
          <div className="sale-banner__collage" data-count={collage.length} aria-hidden="true">
            {collage.map((product, index) => (
              <div key={product.id} className={`sale-banner__card sale-banner__card--${index + 1}`}>
                <img
                  src={product.images[0]}
                  alt=""
                  width={CARD_PHOTO_WIDTH}
                  height={CARD_PHOTO_HEIGHT}
                  loading="lazy"
                  decoding="async"
                />
                <span className="sale-banner__pill">−{discountPercentOf(product)}%</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
