import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MobileTabBar } from './MobileTabBar';

const cart = vi.hoisted(() => ({ totalItems: 3, bump: 0 }));
const auth = vi.hoisted(() => ({ user: null as null | { role: string; name: string } }));
vi.mock('../../context/CartContext', () => ({ useCart: () => cart }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));

const renderBar = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <MobileTabBar />
    </MemoryRouter>
  );

afterEach(() => {
  cleanup();
  cart.totalItems = 3;
  auth.user = null;
});

describe('mobile bottom bar', () => {
  it('has Главная, Категории, Корзина, Профиль in this order, with their links', () => {
    renderBar();
    const links = within(screen.getByRole('navigation')).getAllByRole('link');
    expect(links.map((a) => a.textContent?.replace(/^\d+\+?/, ''))).toEqual(['Главная', 'Категории', 'Корзина', 'Профиль']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/', '/catalog', '/cart', '/login']);
  });

  it('no longer has a Favorites tab', () => {
    renderBar();
    expect(screen.queryByText('Избранное')).not.toBeInTheDocument();
  });

  it('shows the number of items on the cart tab', () => {
    renderBar();
    expect(screen.getByRole('link', { name: /Корзина/ })).toHaveTextContent('3');
  });

  it('shows no counter for an empty cart', () => {
    cart.totalItems = 0;
    renderBar();
    expect(screen.getByRole('link', { name: /Корзина/ })).not.toHaveTextContent(/\d/);
  });

  it('caps the counter at 99+', () => {
    cart.totalItems = 150;
    renderBar();
    expect(screen.getByRole('link', { name: /Корзина/ })).toHaveTextContent('99+');
  });

  it('marks only the current page, "Главная" only at the root', () => {
    renderBar('/catalog/women');
    expect(screen.getByRole('link', { name: 'Категории' })).toHaveClass('is-active');
    expect(screen.getByRole('link', { name: 'Главная' })).not.toHaveClass('is-active');
  });

  it('sends a signed-in customer to the account and the admin to the orders', () => {
    auth.user = { role: 'Customer', name: 'Али' };
    renderBar();
    expect(screen.getByRole('link', { name: 'Профиль' })).toHaveAttribute('href', '/account');
    cleanup();
    auth.user = { role: 'Admin', name: 'A' };
    renderBar();
    expect(screen.getByRole('link', { name: 'Профиль' })).toHaveAttribute('href', '/admin/orders');
  });
});
