import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import './AdminLayout.css';

const NAV_ITEMS = [
  { to: '/admin/orders', label: 'Заказы', icon: OrdersIcon },
  { to: '/admin/products', label: 'Товары', icon: ProductsIcon },
  { to: '/admin/categories', label: 'Категории', icon: CategoriesIcon },
];

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  return (
    <div className="admin-layout">
      <header className="admin-topbar">
        <Link to="/" className="admin-topbar__logo">
          Family Shop
          <span>Admin</span>
        </Link>

        <div className="admin-topbar__actions">
          <button
            className="admin-topbar__icon-btn"
            aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>

          <div className="admin-topbar__user">
            <span className="admin-topbar__user-avatar">{user?.name.charAt(0).toUpperCase() ?? 'A'}</span>
            <div className="admin-topbar__user-info">
              <div className="admin-topbar__user-name">{user?.name}</div>
              <div className="admin-topbar__user-email">{user?.email}</div>
            </div>
          </div>

          <button className="admin-topbar__logout" onClick={logout}>
            Выйти
          </button>
        </div>
      </header>

      <div className="admin-body">
        <nav className="admin-sidebar" aria-label="Разделы админ-панели">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.to;
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to} className={`admin-sidebar__link ${isActive ? 'is-active' : ''}`}>
                <Icon />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <main className="admin-main">{children}</main>
      </div>
    </div>
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

function OrdersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="4" y="6" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 6V5a3 3 0 0 1 6 0v1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 9.5h6M7 12.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ProductsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M4 6.5 10 3l6 3.5v7L10 17l-6-3.5v-7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M4 6.5 10 10m0 0 6-3.5M10 10v7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function CategoriesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="3" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
