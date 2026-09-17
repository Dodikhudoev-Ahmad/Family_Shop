import { Link } from 'react-router-dom';
import { useCategories } from '../../context/CategoriesContext';
import { useAuth } from '../../context/AuthContext';
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
