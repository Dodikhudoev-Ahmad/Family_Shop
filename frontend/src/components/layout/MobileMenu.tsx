import { Link } from 'react-router-dom';
import { useCategories } from '../../context/CategoriesContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import './MobileMenu.css';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestLogout: () => void;
}

export function MobileMenu({ isOpen, onClose, onRequestLogout }: MobileMenuProps) {
  useLockBodyScroll(isOpen);
  const { categories } = useCategories();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <>
      <div className={`mobile-menu__overlay ${isOpen ? 'is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <div className={`mobile-menu ${isOpen ? 'is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Меню">
        <div className="mobile-menu__header">
          <span className="mobile-menu__title">Меню</span>
          <button className="mobile-menu__close" aria-label="Закрыть меню" onClick={onClose}>
            &times;
          </button>
        </div>
        <nav className="mobile-menu__nav">
          {categories.map((c) => (
            <Link key={c.id} to={`/catalog/${c.slug}`} className="mobile-menu__link" onClick={onClose}>
              {c.name}
            </Link>
          ))}
          <Link to="/about" className="mobile-menu__link" onClick={onClose}>
            О нас
          </Link>
          <button className="mobile-menu__link mobile-menu__link--secondary mobile-menu__theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            {theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          </button>
          {user ? (
            <>
              <Link
                to={user.role === 'Admin' ? '/admin/orders' : '/account'}
                className="mobile-menu__link mobile-menu__link--secondary"
                onClick={onClose}
              >
                {user.role === 'Admin' ? 'Администратор' : user.name}
              </Link>
              <button
                className="mobile-menu__link mobile-menu__link--secondary"
                onClick={() => {
                  onClose();
                  onRequestLogout();
                }}
              >
                Выйти
              </button>
            </>
          ) : (
            <Link to="/login" className="mobile-menu__link mobile-menu__link--secondary" onClick={onClose}>
              Войти
            </Link>
          )}
        </nav>
      </div>
    </>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M10 1.5v2M10 16.5v2M18.5 10h-2M3.5 10h-2M15.66 4.34l-1.42 1.42M5.76 14.24l-1.42 1.42M15.66 15.66l-1.42-1.42M5.76 5.76 4.34 4.34"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path
        d="M17 11.5A7 7 0 0 1 8.5 3a7 7 0 1 0 8.5 8.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
