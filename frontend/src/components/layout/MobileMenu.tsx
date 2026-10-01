import { Link } from 'react-router-dom';
import { useCategories } from '../../context/CategoriesContext';
import { useAuth } from '../../context/AuthContext';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import './MobileMenu.css';
import { useTranslation } from 'react-i18next';
import { useLabels } from '../../i18n/labels';
import { LanguageSwitcher } from '../LanguageSwitcher/LanguageSwitcher';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestLogout: () => void;
}

export function MobileMenu({ isOpen, onClose, onRequestLogout }: MobileMenuProps) {
  useLockBodyScroll(isOpen);
  const { t } = useTranslation();
  const { categoryName } = useLabels();
  const { categories } = useCategories();
  const { user } = useAuth();

  return (
    <>
      <div className={`mobile-menu__overlay ${isOpen ? 'is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <div className={`mobile-menu ${isOpen ? 'is-open' : ''}`} role="dialog" aria-modal="true" aria-label={t('menu.title')}>
        <div className="mobile-menu__header">
          <span className="mobile-menu__title">{t('menu.title')}</span>
          <button className="mobile-menu__close" aria-label={t('menu.close')} onClick={onClose}>
            &times;
          </button>
        </div>
        <nav className="mobile-menu__nav">
          {categories.map((c) => (
            <Link key={c.id} to={`/catalog/${c.slug}`} className="mobile-menu__link" onClick={onClose}>
              {categoryName(c)}
            </Link>
          ))}
          <Link to="/about" className="mobile-menu__link" onClick={onClose}>
            {t('header.about')}
          </Link>
          {user ? (
            <>
              <Link
                to={user.role === 'Admin' ? '/admin/orders' : '/account'}
                className="mobile-menu__link mobile-menu__link--secondary"
                onClick={onClose}
              >
                {user.role === 'Admin' ? t('header.admin') : user.name}
              </Link>
              <button
                className="mobile-menu__link mobile-menu__link--secondary"
                onClick={() => {
                  onClose();
                  onRequestLogout();
                }}
              >
                {t('header.logout')}
              </button>
            </>
          ) : (
            <Link to="/login" className="mobile-menu__link mobile-menu__link--secondary" onClick={onClose}>
              {t('header.login')}
            </Link>
          )}
          <div className="mobile-menu__lang">
            <LanguageSwitcher variant="inline" />
          </div>
        </nav>
      </div>
    </>
  );
}
