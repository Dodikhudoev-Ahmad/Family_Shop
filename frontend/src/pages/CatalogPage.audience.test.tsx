import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogPage } from './CatalogPage';
import type { Category, Product } from '../types/product';

const categories: Category[] = [{ id: '3', name: 'Детское', slug: 'kids', hasSizes: true }];

const shoe = (id: string, over: Partial<Product>): Product => ({
  id, name: `Обувь ${id}`, description: '', price: 9000, stock: 5, categoryId: '3', gender: 'kids', images: ['a.jpg'],
  sizes: ['36', '37'], isBestseller: false, createdAt: '2026-09-01T00:00:00Z', averageRating: 0, reviewCount: 0,
  productType: 'Кроссовки', ...over,
});

const catalog: Product[] = [
  shoe('1', { shoeSegment: 'kids', childGender: 'boy' }),
  shoe('2', { shoeSegment: 'kids', childGender: 'girl' }),
  shoe('3', { shoeSegment: 'teen', childGender: 'boy', sizes: ['37', '38', '41'] }),
];

const fetchProductsPage = vi.fn();

vi.mock('../context/CategoriesContext', () => ({ useCategories: () => ({ categories, isLoading: false }) }));
vi.mock('../context/ProductsContext', () => ({ useProducts: () => ({ products: catalog, isLoading: false, error: null }) }));
vi.mock('../lib/api', () => ({ fetchProductsPage: (q: unknown) => fetchProductsPage(q) }));
vi.mock('../components/ProductCard/ProductCard', () => ({ ProductCard: ({ product }: { product: Product }) => <div>{product.name}</div> }));

function Location() {
  const { pathname, search } = useLocation();
  return <span data-testid="location">{pathname + search}</span>;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Location />
      <Routes>
        <Route path="/catalog/:slug" element={<CatalogPage />} />
      </Routes>
    </MemoryRouter>
  );

const sidebar = () => document.querySelector('.catalog__sidebar') as HTMLElement;
const audienceGroup = () => within(sidebar()).getByRole('group', { name: 'Для кого обувь' });
const lastQuery = () => fetchProductsPage.mock.calls.at(-1)![0];

beforeEach(() => {
  fetchProductsPage.mockResolvedValue({ items: [], page: 1, pageSize: 8, hasMore: false, totalCount: 0 });
});
afterEach(() => {
  cleanup();
  fetchProductsPage.mockReset();
});

describe('CatalogPage: who the shoes are for', () => {
  it('offers boys, girls and teens, and asks the server for the chosen one', async () => {
    renderAt('/catalog/kids');
    expect(within(audienceGroup()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Все', 'Мальчики', 'Девочки', 'Подростки']);

    fireEvent.click(within(audienceGroup()).getByRole('button', { name: 'Девочки' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ shoeSegment: 2, childGender: 1 }));

    fireEvent.click(within(audienceGroup()).getByRole('button', { name: 'Подростки' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ shoeSegment: 3 }));
    expect(lastQuery().childGender).toBeUndefined();
  });

  it('keeps the choice and the size in the URL, and applies a link on load', async () => {
    renderAt('/catalog/kids?for=teens&size=38');

    expect(screen.getByTestId('location')).toHaveTextContent('/catalog/kids?for=teens&size=38');
    await waitFor(() => expect(lastQuery()).toMatchObject({ shoeSegment: 3, size: '38' }));
    expect(within(audienceGroup()).getByRole('button', { name: 'Подростки' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(audienceGroup()).getByRole('button', { name: 'Все' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/catalog/kids?size=38');
  });

  it('drops a value from a link that this catalogue cannot satisfy', async () => {
    renderAt('/catalog/kids?for=teens&size=45');

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/catalog/kids?for=teens'));
    expect(screen.getByTestId('location')).not.toHaveTextContent('size=');
  });

  it('offers only the sizes of what is being browsed', () => {
    renderAt('/catalog/kids');
    const sizes = within(sidebar()).getByText('Размер', { selector: 'h4' }).closest('.filter-panel__group') as HTMLElement;

    expect(within(sizes).getAllByRole('button').map((b) => b.textContent)).toEqual(['36', '37', '38', '41']);
  });
});
