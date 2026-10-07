import { NavLink } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { CountBadge } from '../CountBadge/CountBadge';
import './MobileTabBar.css';
import { useTranslation } from 'react-i18next';

export function MobileTabBar() {
  const { t } = useTranslation();
  const { totalItems, bump } = useCart();
  const { user } = useAuth();

  const profileTo = user ? (user.role === 'Admin' ? '/admin/orders' : '/account') : '/login';

  return (
    <nav className="mobile-tabbar" aria-label={t('nav.main')}>
      <NavLink to="/" end className={({ isActive }) => `mobile-tabbar__item ${isActive ? 'is-active' : ''}`}>
        <span className="mobile-tabbar__pill">
          <HomeIcon />
          <span>{t('nav.home')}</span>
        </span>
      </NavLink>

      <NavLink to="/catalog" className={({ isActive }) => `mobile-tabbar__item ${isActive ? 'is-active' : ''}`}>
        <span className="mobile-tabbar__pill">
          <CatalogIcon />
          <span>{t('nav.categories')}</span>
        </span>
      </NavLink>

      <NavLink to="/cart" className={({ isActive }) => `mobile-tabbar__item ${isActive ? 'is-active' : ''}`}>
        <span className="mobile-tabbar__pill">
          <span className="mobile-tabbar__icon-wrap">
            <CartIcon />
            <CountBadge key={bump} count={totalItems} className="mobile-tabbar__badge bounce" />
          </span>
          <span>{t('nav.cart')}</span>
        </span>
      </NavLink>

      <NavLink to={profileTo} className={({ isActive }) => `mobile-tabbar__item ${isActive ? 'is-active' : ''}`}>
        <span className="mobile-tabbar__pill">
          <ProfileIcon />
          <span>{t('nav.profile')}</span>
        </span>
      </NavLink>
    </nav>
  );
}

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
      <path
        d="M3 9.2 10 3l7 6.2V16a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1V9.2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CatalogIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
      <rect x="2.5" y="2.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

// Classic trolley silhouette (hook handle + tapered basket + two wheels),
// matched against a reference screenshot — drawn in-house in the same stroke
// style as the rest of the icon set (strokeWidth 1.6, rounded joins/caps),
// not pulled from an external icon library.
function CartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path
        d="M2.5 4H4.8L6.5 7H17.5L15.3 14H7.7L6.5 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="9.5" cy="17.3" r="1" fill="currentColor" />
      <circle cx="14.5" cy="17.3" r="1" fill="currentColor" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="6.5" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 17c0-3.31 3.13-6 7-6s7 2.69 7 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
