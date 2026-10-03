import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductPage } from './ProductPage';
import { mapProduct } from '../lib/mappers';
import type { Product } from '../types/product';
import type { ProductDto } from '../types/api';

const addItem = vi.fn();
let catalogue: Product[] = [];

vi.mock('../context/ProductsContext', () => ({ useProducts: () => ({ products: catalogue, isLoading: false, error: null }) }));
vi.mock('../context/CategoriesContext', () => ({ useCategories: () => ({ categories, isLoading: false }) }));
vi.mock('../context/CartContext', () => ({ useCart: () => ({ lines: [], addItem, remainingStock: (p: Product) => p.stock }) }));
vi.mock('../context/FavoritesContext', () => ({ useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../context/RecentlyViewedContext', () => ({ useRecentlyViewed: () => ({ addViewed: vi.fn(), viewedIds: [] }) }));
vi.mock('../components/RecentlyViewed/RecentlyViewed', () => ({ RecentlyViewed: () => null }));
vi.mock('../components/Reviews/ProductReviews', () => ({ ProductReviews: () => null }));
vi.mock('../components/ProductCard/ProductCard', () => ({ ProductCard: () => null }));
vi.mock('../components/Slider/Slider', () => ({ Slider: () => null }));

const categories = [
  { id: '1', name: 'Женское', slug: 'women', hasSizes: true },
  { id: '3', name: 'Детское', slug: 'kids', hasSizes: true },
  { id: '4', name: 'Бытовая техника', slug: 'bytovaya-tehnika', hasSizes: false },
];

const dto = (over: Partial<ProductDto>): ProductDto => ({
  id: 7, name: 'Худи оверсайз', description: 'Описание', price: 9000, discountPrice: null, stock: 5, categoryId: 1, gender: 1,
  images: ['a.jpg'], createdAt: '2026-09-01T00:00:00Z', isBestseller: false, averageRating: 0, reviewCount: 0,
  productType: 'Худи', availableSizes: null, ...over,
});

const renderPage = (product: ProductDto, cats = categories) => {
  catalogue = [mapProduct(product, cats)];
  return render(
    <MemoryRouter initialEntries={[`/product/${product.id}`]}>
      <Routes>
        <Route path="/product/:id" element={<ProductPage />} />
      </Routes>
    </MemoryRouter>
  );
};

const sizeButtons = () => [...document.querySelectorAll<HTMLButtonElement>('.product-page__sizes .size-btn')];
const labels = () => sizeButtons().map((b) => b.firstChild?.textContent);
const unavailable = () => sizeButtons().filter((b) => b.getAttribute('aria-disabled') === 'true').map((b) => b.firstChild?.textContent);
const note = () => screen.getByRole('status');
const addButton = () => screen.getByRole('button', { name: 'В корзину' });

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ProductPage - sizes', () => {
  it('shows the whole grid of the type, and marks the sizes the admin does not sell', () => {
    renderPage(dto({ availableSizes: ['M', 'L'] }));

    expect(labels()).toEqual(['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL']); // nothing is hidden
    expect(unavailable()).toEqual(['S', 'XL', '2XL', '3XL', '4XL']);
    const xl = sizeButtons()[3];
    expect(xl).toHaveClass('is-unavailable');
    expect(xl).not.toBeDisabled(); // aria-disabled, not disabled: still focusable
    expect(xl).toHaveAccessibleName('XL, недоступен');
    expect(sizeButtons()[1]).not.toHaveAttribute('aria-disabled');
  });

  it('children\'s shoes with 27, 28 and 30 withdrawn still show 26-35', () => {
    renderPage(dto({ id: 9, categoryId: 3, productType: 'Ботинки', availableSizes: ['26', '29', '31', '32', '33', '34', '35'] }));

    expect(labels()).toEqual(['26', '27', '28', '29', '30', '31', '32', '33', '34', '35']);
    expect(unavailable()).toEqual(['27', '28', '30']);
  });

  it('an unavailable size cannot be selected: it explains itself (live region, no toast) and keeps "В корзину" inactive', () => {
    renderPage(dto({ availableSizes: ['M', 'L'] }));
    expect(note()).toHaveAttribute('aria-live', 'polite');
    expect(note()).toHaveTextContent('');

    fireEvent.click(sizeButtons()[3]); // XL

    expect(sizeButtons()[3]).not.toHaveClass('is-selected');
    expect(note()).toHaveTextContent('Размер XL сейчас недоступен. Выберите другой.');
    expect(addButton()).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(addButton());
    expect(addItem).not.toHaveBeenCalled();
  });

  it('the explanation goes away after about four seconds', () => {
    vi.useFakeTimers();
    renderPage(dto({ availableSizes: ['M', 'L'] }));

    fireEvent.click(sizeButtons()[0]); // S
    expect(note()).toHaveTextContent('Размер S сейчас недоступен');

    act(() => vi.advanceTimersByTime(3900));
    expect(note()).toHaveTextContent('Размер S сейчас недоступен');
    act(() => vi.advanceTimersByTime(200));
    expect(note()).toHaveTextContent('');
  });

  it('...and when another size is chosen', () => {
    renderPage(dto({ availableSizes: ['M', 'L'] }));
    fireEvent.click(sizeButtons()[0]);
    expect(note()).toHaveTextContent('недоступен');

    fireEvent.click(sizeButtons()[1]); // M

    expect(note()).toHaveTextContent('');
    expect(sizeButtons()[1]).toHaveClass('is-selected');
  });

  it('an available size is selected, activates "В корзину" and is added with exactly that size', () => {
    renderPage(dto({ availableSizes: ['M', 'L'] }));
    expect(addButton()).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(sizeButtons()[2]); // L

    expect(addButton()).not.toHaveAttribute('aria-disabled');
    fireEvent.click(addButton());
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ id: '7' }), 'L', 1);
  });

  it('an unavailable size does not unselect a chosen available one', () => {
    renderPage(dto({ availableSizes: ['M', 'L'] }));
    fireEvent.click(sizeButtons()[1]); // M
    fireEvent.click(sizeButtons()[0]); // S (unavailable)

    expect(sizeButtons()[1]).toHaveClass('is-selected');
    expect(addButton()).not.toHaveAttribute('aria-disabled');
  });

  it('AvailableSizes = null: every size of the grid is available (existing products)', () => {
    renderPage(dto({ availableSizes: null }));

    expect(labels()).toEqual(['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL']);
    expect(unavailable()).toEqual([]);
    fireEvent.click(sizeButtons()[6]);
    expect(sizeButtons()[6]).toHaveClass('is-selected');
  });

  it('shows no size selector for a product without sizes, and adds it without a size', () => {
    renderPage(dto({ id: 8, name: 'Холодильник', categoryId: 4, productType: 'Холодильники' }));

    expect(document.querySelector('.product-page__sizes')).toBeNull();
    expect(screen.queryByText('Размер')).not.toBeInTheDocument();
    expect(addButton()).not.toHaveAttribute('aria-disabled');

    fireEvent.click(addButton());
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ id: '8' }), null, 1);
  });
});
