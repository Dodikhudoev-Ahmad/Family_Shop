import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useCategories } from '../../context/CategoriesContext';
import { useAuth } from '../../context/AuthContext';
import { useFavorites } from '../../context/FavoritesContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { MobileMenu } from './MobileMenu';
import { SearchOverlay } from '../Search/SearchOverlay';
import './Header.css';

export function Header() {
  const [isCompact, setIsCompact] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 1025px)');
  const { totalItems, bump, openCart } = useCart();
  const { categories } = useCategories();
  const { user, logout } = useAuth();
  const { favoriteIds } = useFavorites();

  useEffect(() => {
    const onScroll = () => setIsCompact(window.scrollY > 100);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`header ${isCompact ? 'header--compact' : ''}`}>
      <div className="container header__inner">
        {!isDesktop && (
          <button
            className="header__icon-btn header__burger"
            aria-label="Открыть меню"
            onClick={() => setIsMenuOpen(true)}
          >
            <BurgerIcon />
          </button>
        )}

        <Link to="/" className="header__logo">
          Family Shop
        </Link>

        {isDesktop && (
          <nav className="header__nav" aria-label="Категории">
            {categories.map((c) => (
              <NavLink
                key={c.id}
                to={`/catalog/${c.slug}`}
                className={({ isActive }) => `header__nav-link ${isActive ? 'is-active' : ''}`}
              >
                {c.name}
              </NavLink>
            ))}
          </nav>
        )}

        <div className="header__actions">
          <button
            className="header__icon-btn"
            aria-label="Поиск"
            onClick={() => setIsSearchOpen(true)}
          >
            <SearchIcon />
          </button>

          {isDesktop &&
            (user ? (
              <div className="header__account">
                <Link to="/account" className="header__account-link" aria-label="Личный кабинет">
                  <span className="header__avatar">{user.name.charAt(0).toUpperCase()}</span>
                  <span className="header__account-name">{user.name}</span>
                </Link>
                <button className="header__icon-btn" aria-label="Выйти" onClick={logout}>
                  <LogoutIcon />
                </button>
              </div>
            ) : (
              <Link to="/login" className="header__login-link">
                Войти
              </Link>
            ))}

          <Link to="/favorites" className="header__icon-btn header__fav-btn" aria-label="Избранное">
            <HeartIcon />
            {favoriteIds.length > 0 && <span className="header__cart-count">{favoriteIds.length}</span>}
          </Link>

          <button className="header__icon-btn header__cart-btn" aria-label="Корзина" onClick={openCart}>
            <CartIcon />
            {totalItems > 0 && (
              <span key={bump} className="header__cart-count bounce">
                {totalItems}
              </span>
            )}
          </button>
        </div>
      </div>

      <MobileMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
      <SearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </header>
  );
}

function BurgerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M2 5h18M2 11h18M2 17h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M18 18L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
      <path d="M8 3H4.5A1.5 1.5 0 0 0 3 4.5v11A1.5 1.5 0 0 0 4.5 17H8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13 14l4-4-4-4M17 10H8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 17.5s-7-4.35-7-9.5A4 4 0 0 1 10 5.5 4 4 0 0 1 17 8c0 5.15-7 9.5-7 9.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 21 21" fill="none">
      <path d="M5 7h11l-1 10H6L5 7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 7V5.5a2.5 2.5 0 0 1 5 0V7" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
