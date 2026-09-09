import { Link } from 'react-router-dom';
import { useCategories } from '../../context/CategoriesContext';
import { useAuth } from '../../context/AuthContext';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import './MobileMenu.css';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  useLockBodyScroll(isOpen);
  const { categories } = useCategories();
  const { user, logout } = useAuth();

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
          {user ? (
            <>
              <Link to="/account" className="mobile-menu__link mobile-menu__link--secondary" onClick={onClose}>
                {user.name}
              </Link>
              <button
                className="mobile-menu__link mobile-menu__link--secondary"
                onClick={() => {
                  logout();
                  onClose();
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
