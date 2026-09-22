import { NavLink } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useFavorites } from '../../context/FavoritesContext';
import { useAuth } from '../../context/AuthContext';
import './MobileTabBar.css';

export function MobileTabBar() {
  const { totalItems, bump, openCart, isOpen: isCartOpen } = useCart();
  const { favoriteIds, bump: favBump } = useFavorites();
  const { user } = useAuth();

  const profileTo = user ? (user.role === 'Admin' ? '/admin/orders' : '/account') : '/login';

  return (
    <nav className="mobile-tabbar" aria-label="Основная навигация">
      <NavLink to="/catalog" className={({ isActive }) => `mobile-tabbar__item ${isActive ? 'is-active' : ''}`}>
        <CatalogIcon />
        <span>Каталог</span>
      </NavLink>

      <button
        type="button"
        className={`mobile-tabbar__item mobile-tabbar__item--button ${isCartOpen ? 'is-active' : ''}`}
        onClick={openCart}
      >
        <span className="mobile-tabbar__icon-wrap">
          <CartIcon />
          {totalItems > 0 && (
            <span key={bump} className="mobile-tabbar__badge bounce">
              {totalItems}
            </span>
          )}
        </span>
        <span>Корзина</span>
      </button>

      <NavLink to="/favorites" className={({ isActive }) => `mobile-tabbar__item ${isActive ? 'is-active' : ''}`}>
        <span className="mobile-tabbar__icon-wrap">
          <HeartIcon />
          {favoriteIds.length > 0 && (
            <span key={favBump} className="mobile-tabbar__badge bounce">
              {favoriteIds.length}
            </span>
          )}
        </span>
        <span>Избранное</span>
      </NavLink>

      <NavLink to={profileTo} className={({ isActive }) => `mobile-tabbar__item ${isActive ? 'is-active' : ''}`}>
        <ProfileIcon />
        <span>Профиль</span>
      </NavLink>
    </nav>
  );
}

function CatalogIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2.5" y="2.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
      <path d="M5 7h11l-1 10H6L5 7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 7V5.5a2.5 2.5 0 0 1 5 0V7" stroke="currentColor" strokeWidth="1.6" />
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

function ProfileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="6.5" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 17c0-3.31 3.13-6 7-6s7 2.69 7 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
