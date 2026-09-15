import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminRoute } from './AdminRoute';
import * as AuthContext from '../../context/AuthContext';

vi.mock('../../context/AuthContext');

afterEach(cleanup);

function renderAdminRoute() {
  return render(
    <MemoryRouter initialEntries={['/admin/orders']}>
      <Routes>
        <Route path="/" element={<div>Home page</div>} />
        <Route
          path="/admin/orders"
          element={
            <AdminRoute>
              <div>Admin content</div>
            </AdminRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminRoute', () => {
  it('redirects an unauthenticated user to home', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: null,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    renderAdminRoute();

    expect(screen.getByText('Home page')).toBeInTheDocument();
    expect(screen.queryByText('Admin content')).not.toBeInTheDocument();
  });

  it('redirects a non-admin user to home', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 1, email: 'a@b.com', name: 'A', role: 'Customer' },
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    renderAdminRoute();

    expect(screen.getByText('Home page')).toBeInTheDocument();
  });

  it('renders admin content for an admin user', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: { id: 1, email: 'a@b.com', name: 'A', role: 'Admin' },
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    renderAdminRoute();

    expect(screen.getByText('Admin content')).toBeInTheDocument();
  });
});
