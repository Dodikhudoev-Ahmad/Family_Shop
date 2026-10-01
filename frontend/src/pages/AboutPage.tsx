import { CONTACT_EMAIL } from '../data/contacts';
import { Link } from 'react-router-dom';
import { useProducts } from '../context/ProductsContext';
import { useCategories } from '../context/CategoriesContext';
import { Reveal } from '../components/Reveal';
import { Button } from '../components/Button/Button';
import { useSeo } from '../hooks/useSeo';
import { SITE_NAME } from '../data/seo';
import './AboutPage.css';
import { useTranslation } from 'react-i18next';

const values = [
  { id: 'quality', icon: <QualityIcon /> },
  { id: 'family', icon: <FamilyIcon /> },
  { id: 'minimalism', icon: <MinimalIcon /> },
  { id: 'care', icon: <CareIcon /> },
] as const;

export function AboutPage() {
  const { t } = useTranslation();
  useSeo({
    title: t('seo.aboutTitle', { site: SITE_NAME }),
    description: t('seo.aboutDescription'),
  });

  const { products, isLoading: productsLoading } = useProducts();
  const { categories, isLoading: categoriesLoading } = useCategories();

  const stats = [
    { value: productsLoading ? '—' : `${products.length}+`, label: t('about.statProducts') },
    { value: categoriesLoading ? '—' : `${categories.length}`, label: t('about.statCategories') },
    { value: '3', label: t('about.statDirections') },
    { value: 'KZ', label: t('about.statDelivery') },
  ];

  return (
    <div className="about">
      <section className="about-hero container">
        <Reveal>
          <span className="about-hero__eyebrow">{t('about.eyebrow')}</span>
        </Reveal>
        <Reveal>
          <h1 className="about-hero__title">{t('about.heroTitle')}</h1>
        </Reveal>
        <Reveal>
          <p className="about-hero__text">
            {t('about.heroText')}
          </p>
        </Reveal>
      </section>

      <section className="about-section container">
        <Reveal>
          <h2 className="about-section__title">{t('about.principles')}</h2>
        </Reveal>
        <div className="about-values">
          {values.map((v) => (
            <Reveal key={v.id} className="about-values__item">
              <div className="about-value">
                <span className="about-value__icon">{v.icon}</span>
                <h3 className="about-value__title">{t(`about.${v.id}Title`)}</h3>
                <p className="about-value__text">{t(`about.${v.id}Text`)}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="about-stats-section">
        <div className="container">
          <div className="about-stats">
            {stats.map((s) => (
              <Reveal key={s.label} className="about-stats__item">
                <div className="about-stat">
                  <span className="about-stat__value">{s.value}</span>
                  <span className="about-stat__label">{s.label}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="about-cta container">
        <Reveal>
          <h2 className="about-cta__title">{t('about.ctaTitle')}</h2>
        </Reveal>
        <Reveal>
          <p className="about-cta__text">
            {t('about.ctaText')}
          </p>
        </Reveal>
        <Reveal>
          <div className="about-cta__actions">
            <Link to="/catalog">
              <Button variant="primary" size="lg">
                {t('about.ctaButton')}
              </Button>
            </Link>
            {CONTACT_EMAIL && (
              <a href={`mailto:${CONTACT_EMAIL}`} className="about-cta__contact">
                {t('about.ctaMail', { email: CONTACT_EMAIL })}
              </a>
            )}
          </div>
        </Reveal>
      </section>
    </div>
  );
}

function QualityIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3l2.4 4.86 5.36.78-3.88 3.78.92 5.34L12 15.27l-4.8 2.49.92-5.34-3.88-3.78 5.36-.78L12 3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FamilyIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="8" cy="7" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16.5" cy="8" r="1.9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 19c0-2.9 2-5 4.5-5s4.5 2.1 4.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13.5 15.2c1.9.4 3.2 2 3.2 3.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function MinimalIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="4" width="7" height="7" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16.5" cy="7.5" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 20l6-8 4 5 3-3.5 3 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CareIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 20.5s-7.5-4.6-7.5-10a4.4 4.4 0 0 1 7.5-3.1A4.4 4.4 0 0 1 19.5 10.5c0 5.4-7.5 10-7.5 10z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
