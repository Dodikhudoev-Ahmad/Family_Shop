import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './AdminLayout.css';

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Link to="/" className="admin-sidebar__logo">
          Family Shop
          <span>Admin</span>
        </Link>

        <nav className="admin-sidebar__nav">
          <span className="admin-sidebar__nav-item is-active">
            <OrdersIcon />
            Заказы
          </span>
        </nav>

        <div className="admin-sidebar__footer">
          <div className="admin-sidebar__user">
            <span className="admin-sidebar__user-avatar">{user?.name.charAt(0).toUpperCase() ?? 'A'}</span>
            <div>
              <div className="admin-sidebar__user-name">{user?.name}</div>
              <div className="admin-sidebar__user-email">{user?.email}</div>
            </div>
          </div>
          <button className="admin-sidebar__logout" onClick={logout}>
            Выйти
          </button>
        </div>
      </aside>

      <main className="admin-main">{children}</main>
    </div>
  );
}

function OrdersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="3" y="4" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 9h6M6 12h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
