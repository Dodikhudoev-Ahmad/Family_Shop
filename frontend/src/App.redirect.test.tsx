import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./components/layout/Layout', async () => {
  const { Outlet } = await import('react-router-dom');
  return { Layout: () => <Outlet /> };
});
vi.mock('./components/SplashScreen/SplashScreen', () => ({ SplashScreen: () => null }));
vi.mock('./pages/CatalogPage', () => ({ CatalogPage: () => <div>catalog-page</div> }));

afterEach(() => window.history.pushState({}, '', '/'));

describe('legacy /catalog/shoes-bags URL', () => {
  it('redirects to the full catalog instead of a dead end', () => {
    window.history.pushState({}, '', '/catalog/shoes-bags');
    render(<App />);

    expect(window.location.pathname).toBe('/catalog');
    expect(screen.getByText('catalog-page')).toBeInTheDocument();
  });

  it('leaves regular category URLs alone', () => {
    window.history.pushState({}, '', '/catalog/men');
    render(<App />);

    expect(window.location.pathname).toBe('/catalog/men');
  });
});
