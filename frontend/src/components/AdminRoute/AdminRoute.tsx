import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './AdminRoute.css';

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="admin-route-loader">
        <span className="admin-route-loader__mark">Family Shop</span>
        <span className="admin-route-loader__dots">
          <i />
          <i />
          <i />
        </span>
      </div>
    );
  }

  if (!user || user.role !== 'Admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
