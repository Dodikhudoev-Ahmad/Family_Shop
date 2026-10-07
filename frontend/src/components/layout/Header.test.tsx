import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header';
import { useHomeVariant } from '../../lib/homeVariant';

const desktop = vi.hoisted(() => ({ value: false }));
vi.mock('../../hooks/useMediaQuery', () => ({ useMediaQuery: () => desktop.value }));
vi.mock('../../context/CartContext', () => ({ useCart: () => ({ totalItems: 2, bump: 0 }) }));
vi.mock('../../context/CategoriesContext', () => ({ useCategories: () => ({ categories: [], isLoading: false }) }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: null, logout: vi.fn() }) }));
vi.mock('../../context/FavoritesContext', () => ({ useFavorites: () => ({ favoriteIds: ['1'], bump: 0 }) }));
vi.mock('../../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }));
vi.mock('../../context/HeaderVisibilityContext', () => ({
  useHeaderVisibility: () => ({ isCompact: false, isHidden: false, setOverlayOpen: vi.fn() }),
}));

// The header itself carries no colour: it reads tokens, and the variant only sets <html data-variant>.
function Page() {
  const variant = useHomeVariant();
  return (
    <>
      <span data-testid="variant">{variant}</span>
      <Header />
    </>
  );
}

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Page />
    </MemoryRouter>
  );

beforeEach(() => {
  sessionStorage.clear();
  delete document.documentElement.dataset.variant;
});
afterEach(() => {
  cleanup();
  desktop.value = false;
});

describe.each([
  ['a', '/?variant=a'],
  ['b', '/?variant=b'],
  ['a', '/'],
])('header, variant %s (%s), mobile', (variant, url) => {
  it('renders the logo, burger and the white search field and publishes the variant', () => {
    renderAt(url);
    expect(screen.getByTestId('variant')).toHaveTextContent(variant);
    expect(document.documentElement.dataset.variant).toBe(variant);
    expect(screen.getByRole('link', { name: 'FamilyShop — на главную' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открыть меню' })).toBeInTheDocument();
    const search = screen.getByRole('button', { name: 'Поиск' });
    expect(search).toHaveClass('header__search-bar');
    expect(search).toHaveTextContent('Искать в FamilyShop');
  });
});

describe('header on desktop', () => {
  it.each(['/?variant=a', '/?variant=b'])('renders nav, cart and favorites with counters (%s)', (url) => {
    desktop.value = true;
    renderAt(url);
    const nav = document.querySelector('.header__nav') as HTMLElement;
    expect(within(nav).getByRole('link', { name: 'О нас' })).toBeInTheDocument();
    expect(document.querySelector('.header__cart-btn')).toHaveTextContent('2');
    expect(document.querySelector('.header__fav-btn')).toHaveTextContent('1');
    expect(screen.queryByRole('button', { name: 'Открыть меню' })).not.toBeInTheDocument();
  });
});
