import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminProductsPage } from './AdminProductsPage';
import type { CategoryDto, ProductDto, SizeGridsDto } from '../../types/api';
import { ApiError } from '../../lib/api';

const api = vi.hoisted(() => ({
  fetchCategories: vi.fn(),
  fetchSizeGrids: vi.fn(),
  fetchProductsPage: vi.fn(),
  createAdminProduct: vi.fn(),
  updateAdminProduct: vi.fn(),
}));

vi.mock('../../lib/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../lib/api')>()), ...api }));
vi.mock('../../components/AdminLayout/AdminLayout', () => ({ AdminLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));

const categories: CategoryDto[] = [
  { id: 1, name: 'Женское', slug: 'women', parentCategoryId: null, hasSizes: true },
  { id: 2, name: 'Мужское', slug: 'men', parentCategoryId: null, hasSizes: true },
  { id: 3, name: 'Детское', slug: 'kids', parentCategoryId: null, hasSizes: true },
  { id: 4, name: 'Бытовая техника', slug: 'bytovaya-tehnika', parentCategoryId: null, hasSizes: false },
];

const product = (over: Partial<ProductDto>): ProductDto => ({
  id: 1, name: 'Товар', description: 'Описание', price: 1000, discountPrice: null, stock: 5, categoryId: 2, gender: 0,
  images: ['https://example.com/a.jpg'], createdAt: '2026-09-01T00:00:00Z', isBestseller: false, averageRating: 0, reviewCount: 0,
  productType: null, availableSizes: null, ...over,
});

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
const sizeGrids: SizeGridsDto = {
  shoes: [
    { segment: 0, gender: 0, sizes: range(39, 45), childGenders: [] },
    { segment: 1, gender: 1, sizes: range(35, 41), childGenders: [] },
    { segment: 2, gender: 2, sizes: range(27, 37), childGenders: [0, 1] },
    { segment: 3, gender: 2, sizes: range(37, 41), childGenders: [0, 1] },
  ],
};

const sneakers = product({ id: 10, name: 'Кроссовки Лайт', categoryId: 2, productType: 'Кроссовки', availableSizes: ['40', '41'], shoeSegment: 0 });
const kidsShoes = product({ id: 11, name: 'Ботинки малыш', categoryId: 3, gender: 2, productType: 'Ботинки', availableSizes: null, shoeSegment: 2, childGender: 0 });
const fridge = product({ id: 12, name: 'Холодильник мини', categoryId: 4, productType: 'Холодильники', availableSizes: null });
const hoodie = product({ id: 13, name: 'Худи', categoryId: 2, productType: 'Худи', availableSizes: ['S', 'M', 'L', 'XL'] });

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchCategories.mockResolvedValue(categories);
  api.fetchSizeGrids.mockResolvedValue(sizeGrids);
  api.fetchProductsPage.mockResolvedValue({ items: [sneakers, kidsShoes, fridge, hoodie], totalCount: 4, page: 1, pageSize: 12, hasMore: false });
  api.updateAdminProduct.mockImplementation((_id: number, request: unknown) => Promise.resolve(request));
});
afterEach(cleanup);

async function openEdit(name: string) {
  render(<AdminProductsPage />);
  const row = (await screen.findByText(name)).closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Изменить' }));
  return screen.findByRole('group', { name: /Одежда|обувь/i }).catch(() => null);
}

const checked = () =>
  screen.queryAllByRole('checkbox').filter((c) => (c.closest('.admin-sizes__item') as HTMLElement | null) && (c as HTMLInputElement).checked).map((c) => c.nextSibling!.textContent);
const sizeBoxes = () => screen.queryAllByRole('checkbox').filter((c) => c.closest('.admin-sizes__item'));
const typeSelect = () => screen.getByLabelText('Тип товара') as HTMLSelectElement;
const categorySelect = () => screen.getByLabelText('Категория') as HTMLSelectElement;

describe('product form - sizes', () => {
  it('shows the adult shoe group with exactly the product\'s sizes ticked, and "select all" / "clear all"', async () => {
    const group = await openEdit('Кроссовки Лайт');

    expect(group).not.toBeNull();
    expect(screen.getAllByText('Мужская обувь').length).toBeGreaterThan(0);
    expect(sizeBoxes().map((c) => c.nextSibling!.textContent)).toEqual(range(39, 45));
    expect(checked()).toEqual(['40', '41']);

    fireEvent.click(screen.getByRole('button', { name: 'Выбрать все' }));
    expect(checked()).toEqual(range(39, 45));

    fireEvent.click(screen.getByRole('button', { name: 'Снять все' }));
    expect(checked()).toEqual([]);
  });

  it('refuses to save a sized product with no size ticked', async () => {
    await openEdit('Кроссовки Лайт');
    fireEvent.click(screen.getByRole('button', { name: 'Снять все' }));

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить товар' }));

    expect(await screen.findByText('Выберите хотя бы один размер.')).toBeInTheDocument();
    expect(api.updateAdminProduct).not.toHaveBeenCalled();
  });

  it('sends the ticked sizes and the type on save', async () => {
    await openEdit('Худи');
    fireEvent.click(screen.getByLabelText('XL')); // untick XL

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить товар' }));

    await waitFor(() => expect(api.updateAdminProduct).toHaveBeenCalledTimes(1));
    expect(api.updateAdminProduct.mock.calls[0][1]).toMatchObject({ productType: 'Худи', availableSizes: ['S', 'M', 'L'] });
  });

  it('kids shoes use the children\'s grid 27-37 (all ticked when the product has no custom selection)', async () => {
    await openEdit('Ботинки малыш');

    expect(sizeBoxes().map((c) => c.nextSibling!.textContent)).toEqual(range(27, 37));
    expect(checked()).toHaveLength(11);
    expect(screen.getByLabelText('Возрастная группа')).toHaveValue('2');
  });

  it('a product type without sizes shows the note, no checkboxes, and sends no sizes', async () => {
    await openEdit('Холодильник мини');

    expect(screen.getByText('Для этого типа товаров размеры не используются')).toBeInTheDocument();
    expect(sizeBoxes()).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить товар' }));
    await waitFor(() => expect(api.updateAdminProduct).toHaveBeenCalledTimes(1));
    expect(api.updateAdminProduct.mock.calls[0][1]).toMatchObject({ productType: 'Холодильники', availableSizes: null });
  });

  it('changing the type resets the sizes to the whole new grid', async () => {
    await openEdit('Кроссовки Лайт');
    expect(checked()).toEqual(['40', '41']);

    fireEvent.change(typeSelect(), { target: { value: 'Ботинки' } }); // same grid, but the selection starts over
    expect(checked()).toEqual(range(39, 45));

    fireEvent.change(typeSelect(), { target: { value: 'Худи' } });
    expect(sizeBoxes().map((c) => c.nextSibling!.textContent)).toEqual(['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL']);
    expect(checked()).toHaveLength(7);

    fireEvent.change(typeSelect(), { target: { value: 'Сумки' } });
    expect(screen.getByText('Для этого типа товаров размеры не используются')).toBeInTheDocument();
    expect(sizeBoxes()).toHaveLength(0);
  });

  it('changing the category clears a type it does not offer and the grid with it', async () => {
    await openEdit('Кроссовки Лайт');

    fireEvent.change(categorySelect(), { target: { value: '4' } }); // Бытовая техника

    expect(typeSelect().value).toBe('');
    expect(screen.getByText(/Выберите тип товара — появится размерная сетка/)).toBeInTheDocument();
    expect(sizeBoxes()).toHaveLength(0);
  });

  it('moving shoes to Детское switches to the children\'s grid', async () => {
    await openEdit('Кроссовки Лайт');

    fireEvent.change(categorySelect(), { target: { value: '3' } });

    expect(typeSelect().value).toBe('Кроссовки'); // still offered there
    expect(sizeBoxes().map((c) => c.nextSibling!.textContent)).toEqual(range(27, 37));
    expect(checked()).toHaveLength(11);
  });

  it('a new product starts with every size of the chosen type ticked', async () => {
    render(<AdminProductsPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: /Добавить товар/ }))[0]);
    fireEvent.change(await screen.findByLabelText('Категория'), { target: { value: '2' } });

    fireEvent.change(typeSelect(), { target: { value: 'Худи' } });

    expect(checked()).toHaveLength(7);
  });
});

describe('products list - size summary', () => {
  it('shows a short summary per product', async () => {
    render(<AdminProductsPage />);
    await screen.findByText('Худи');

    const cellOf = (name: string) => screen.getByText(name).closest('tr')!.querySelector('.admin-products__sizes')!.textContent;
    expect(cellOf('Кроссовки Лайт')).toBe('40–41');
    expect(cellOf('Ботинки малыш')).toBe('27–37');
    expect(cellOf('Холодильник мини')).toBe('без размеров');
    expect(cellOf('Худи')).toBe('S–XL');
  });
});

describe('product form - shoe segment and boy/girl', () => {
  const childGenderRadio = (name: string) => screen.getByRole('radio', { name });

  it('shows no age group and no boy/girl for adult shoes', async () => {
    await openEdit('Кроссовки Лайт');

    expect(screen.queryByLabelText('Возрастная группа')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Для кого обувь' })).not.toBeInTheDocument();
  });

  it('children\'s shoes ask boy or girl, and the choice is sent with the segment', async () => {
    await openEdit('Ботинки малыш');

    expect(childGenderRadio('Мальчик')).toBeChecked();
    fireEvent.click(childGenderRadio('Девочка'));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить товар' }));

    await waitFor(() => expect(api.updateAdminProduct).toHaveBeenCalledTimes(1));
    expect(api.updateAdminProduct.mock.calls[0][1]).toMatchObject({ shoeSegment: 2, childGender: 1, gender: 2 });
  });

  it('teen is a choice of the same category with its own grid, 37 included', async () => {
    await openEdit('Ботинки малыш');

    fireEvent.change(screen.getByLabelText('Возрастная группа'), { target: { value: '3' } });

    expect(sizeBoxes().map((c) => c.nextSibling!.textContent)).toEqual(range(37, 41));
    expect(checked()).toHaveLength(5);
  });

  it('will not save a children\'s shoe without boy or girl, and does not send adult shoes any', async () => {
    api.fetchProductsPage.mockResolvedValue({
      items: [{ ...kidsShoes, childGender: null }, sneakers], totalCount: 2, page: 1, pageSize: 12, hasMore: false,
    });
    await openEdit('Ботинки малыш');

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить товар' }));
    expect(await screen.findByText('Укажите, для кого обувь: мальчик или девочка.')).toBeInTheDocument();
    expect(api.updateAdminProduct).not.toHaveBeenCalled();

    cleanup();
    await openEdit('Кроссовки Лайт');
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить товар' }));
    await waitFor(() => expect(api.updateAdminProduct).toHaveBeenCalledTimes(1));
    expect(api.updateAdminProduct.mock.calls[0][1]).toMatchObject({ shoeSegment: 0, childGender: null });
  });

  it('shows what the server refuses about the sizes at the sizes, not at the top', async () => {
    api.updateAdminProduct.mockRejectedValue(new ApiError('Размер «45» не входит в размерную сетку этого типа товаров.'));
    await openEdit('Кроссовки Лайт');

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить товар' }));

    const message = await screen.findByText('Размер «45» не входит в размерную сетку этого типа товаров.');
    expect(message.closest('.admin-sizes')).not.toBeNull();
  });
});
