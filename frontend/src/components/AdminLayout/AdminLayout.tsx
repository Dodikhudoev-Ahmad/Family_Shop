import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import './AdminLayout.css';

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

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

      <main className="admin-main">{children}</main>
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
