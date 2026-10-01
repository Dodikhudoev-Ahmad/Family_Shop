import { Link } from 'react-router-dom';
import {
  CONTACT_ADDRESS,
  CONTACT_EMAIL,
  CONTACT_PHONE,
  CONTACT_PHONE_HREF,
  CONTACT_TELEGRAM,
  CONTACT_WHATSAPP,
  SOCIAL_LINKS,
} from '../../data/contacts';
import { useCategories } from '../../context/CategoriesContext';
import './Footer.css';
import { useTranslation } from 'react-i18next';
import { useLabels } from '../../i18n/labels';

export function Footer() {
  const { t } = useTranslation();
  const { categoryName } = useLabels();
  const { categories } = useCategories();

  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div className="footer__col">
          <span className="footer__logo">Family Shop</span>
          <p className="footer__text">{t('footer.tagline')}</p>
        </div>

        <div className="footer__col">
          <h4 className="footer__heading">{t('footer.categories')}</h4>
          <ul className="footer__list">
            {categories.map((c) => (
              <li key={c.id}>
                <Link to={`/catalog/${c.slug}`} className="footer__link">
                  {categoryName(c)}
                </Link>
              </li>
            ))}
            <li>
              <Link to="/about" className="footer__link">
                {t('header.about')}
              </Link>
            </li>
          </ul>
        </div>

        {(CONTACT_PHONE || CONTACT_EMAIL || CONTACT_ADDRESS || CONTACT_WHATSAPP || CONTACT_TELEGRAM) && (
          <div className="footer__col">
            <h4 className="footer__heading">{t('footer.contacts')}</h4>
            <ul className="footer__list">
              {CONTACT_PHONE && (
                <li>
                  <a className="footer__link footer__contact-link" href={CONTACT_PHONE_HREF}>
                    <PhoneIcon />
                    {CONTACT_PHONE}
                  </a>
                </li>
              )}
              {CONTACT_EMAIL && <li className="footer__link">{CONTACT_EMAIL}</li>}
              {CONTACT_ADDRESS && <li className="footer__link">{CONTACT_ADDRESS}</li>}
              {CONTACT_WHATSAPP && (
                <li>
                  <a
                    className="footer__link footer__contact-link"
                    href={CONTACT_WHATSAPP}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <WhatsAppIcon />
                    WhatsApp
                  </a>
                </li>
              )}
              {CONTACT_TELEGRAM && (
                <li>
                  <a
                    className="footer__link footer__contact-link"
                    href={CONTACT_TELEGRAM}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <TelegramIcon />
                    Telegram
                  </a>
                </li>
              )}
            </ul>
          </div>
        )}

        {SOCIAL_LINKS.length > 0 && (
          <div className="footer__col">
            <h4 className="footer__heading">{t('footer.social')}</h4>
            <ul className="footer__list">
              {SOCIAL_LINKS.map((social) => (
                <li key={social.label}>
                  <a className="footer__link" href={social.href} target="_blank" rel="noopener noreferrer">
                    {social.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="footer__bottom container">
        <span>{t('footer.rights', { year: new Date().getFullYear() })}</span>
      </div>
    </footer>
  );
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M6.5 3.5l1.8 3.2-1.4 1.6a8.5 8.5 0 0 0 4.8 4.8l1.6-1.4 3.2 1.8v2.3c0 .8-.7 1.4-1.5 1.3-3-.4-5.9-1.8-8.1-4C4.9 11.1 3.5 8.2 3.1 5.2c-.1-.8.5-1.5 1.3-1.5h2.1z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 3.3a6.7 6.7 0 0 0-5.7 10.2L3.3 16.7l3.3-1a6.7 6.7 0 1 0 3.4-12.4z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M7.4 7.6c-.1.9.4 1.9 1.1 2.7.8.8 1.7 1.3 2.7 1.2.4 0 .8-.4.9-.9l.1-.5-1.7-.7-.5.6c-.6-.2-1.2-.7-1.5-1.4l.5-.6-.6-1.6-.5.1c-.5.1-.6.6-.5 1.1z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="6.7" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M6.2 9.9l7-2.7-2.4 6.9-1.6-1.9-1.2 1.1-.1-1.9z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
