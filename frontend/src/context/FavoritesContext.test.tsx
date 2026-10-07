import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FavoritesProvider, useFavorites } from './FavoritesContext';

vi.mock('./ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));

const KEY = 'family-shop:favorites';

function Probe() {
  const { favoriteIds, isFavorite, toggleFavorite } = useFavorites();
  return (
    <div>
      <span data-testid="ids">{favoriteIds.join(',')}</span>
      <span data-testid="is-7">{String(isFavorite('7'))}</span>
      <button onClick={() => toggleFavorite('7', 'Платье')}>toggle-7</button>
      <button onClick={() => toggleFavorite('8', 'Куртка')}>toggle-8</button>
    </div>
  );
}

const renderProbe = () =>
  render(
    <FavoritesProvider>
      <Probe />
    </FavoritesProvider>
  );

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('favorites (the heart on a card)', () => {
  it('saves a toggled product to localStorage', () => {
    renderProbe();
    act(() => screen.getByText('toggle-7').click());
    expect(screen.getByTestId('is-7')).toHaveTextContent('true');
    expect(JSON.parse(localStorage.getItem(KEY) ?? '[]')).toEqual(['7']);
  });

  it('reads saved favorites back on the next visit', () => {
    localStorage.setItem(KEY, JSON.stringify(['7', '8']));
    renderProbe();
    expect(screen.getByTestId('ids')).toHaveTextContent('7,8');
    expect(screen.getByTestId('is-7')).toHaveTextContent('true');
  });

  it('removes a product on the second toggle and saves that too', () => {
    localStorage.setItem(KEY, JSON.stringify(['7', '8']));
    renderProbe();
    act(() => screen.getByText('toggle-7').click());
    expect(screen.getByTestId('ids')).toHaveTextContent('8');
    expect(JSON.parse(localStorage.getItem(KEY) ?? '[]')).toEqual(['8']);
  });

  it('starts empty on a broken saved value instead of crashing', () => {
    localStorage.setItem(KEY, '{not json');
    renderProbe();
    expect(screen.getByTestId('ids')).toHaveTextContent('');
  });

  it('keeps working in memory when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderProbe();
    act(() => screen.getByText('toggle-8').click());
    expect(screen.getByTestId('ids')).toHaveTextContent('8');
  });
});
