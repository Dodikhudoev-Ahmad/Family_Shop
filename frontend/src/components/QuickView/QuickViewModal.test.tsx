import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickViewModal } from './QuickViewModal';
import type { Product } from '../../types/product';

const addItem = vi.fn();
const showToast = vi.fn();
const close = vi.fn();
let current: Product | null = null;

vi.mock('../../context/QuickViewContext', () => ({ useQuickView: () => ({ product: current, open: vi.fn(), close }) }));
vi.mock('../../context/CartContext', () => ({ useCart: () => ({ addItem }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../../hooks/useLockBodyScroll', () => ({ useLockBodyScroll: () => undefined }));

const GRID = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];

const product = (over: Partial<Product> = {}): Product => ({
  id: '7', name: 'Худи оверсайз', description: 'Описание', price: 9000, stock: 5, categoryId: '1', gender: 'female',
  images: ['a.jpg'], sizes: GRID, gridSizes: GRID, createdAt: '2026-09-01T00:00:00Z', averageRating: 0, reviewCount: 0, ...over,
});

const renderModal = (p: Product) => {
  current = p;
  return render(
    <MemoryRouter>
      <QuickViewModal />
    </MemoryRouter>
  );
};

const buttons = () => [...document.querySelectorAll<HTMLButtonElement>('.quick-view__sizes .size-btn')];
const labels = () => buttons().map((b) => b.firstChild?.textContent);
const button = (size: string) => buttons().find((b) => b.firstChild?.textContent === size)!;

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  current = null;
});

describe('QuickViewModal - sizes', () => {
  it('shows every size of the grid, in the grid order', () => {
    renderModal(product());
    expect(labels()).toEqual(GRID);
  });

  it('shows the whole grid, with the sizes the admin does not sell disabled', () => {
    renderModal(product({ sizes: ['M', 'L'] }));
    expect(labels()).toEqual(GRID);
    const off = buttons().filter((b) => b.getAttribute('aria-disabled') === 'true').map((b) => b.firstChild?.textContent);
    expect(off).toEqual(['S', 'XL', '2XL', '3XL', '4XL']);
    expect(button('S').classList.contains('is-unavailable')).toBe(true);
    expect(button('M').getAttribute('aria-disabled')).toBeNull();
  });

  it('selects a size (aria-pressed) and adds it to the cart', () => {
    renderModal(product());
    expect(button('L').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button('L'));
    expect(button('L').getAttribute('aria-pressed')).toBe('true');
    expect(button('M').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'В корзину' }));
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({ id: '7' }), 'L');
    expect(close).toHaveBeenCalled();
  });

  it('does not select an unavailable size, explains it, and keeps the previous choice', () => {
    renderModal(product({ sizes: ['M', 'L'] }));
    fireEvent.click(button('M'));
    fireEvent.click(button('XL'));
    expect(button('XL').getAttribute('aria-pressed')).toBe('false');
    expect(button('M').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('status').textContent).toContain('XL');
    fireEvent.click(button('L'));
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('asks for a size instead of adding when none is picked', () => {
    renderModal(product());
    fireEvent.click(screen.getByRole('button', { name: 'В корзину' }));
    expect(addItem).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error');
  });

  it('works with a single size', () => {
    renderModal(product({ sizes: ['M'], gridSizes: ['M'] }));
    expect(labels()).toEqual(['M']);
    fireEvent.click(button('M'));
    fireEvent.click(screen.getByRole('button', { name: 'В корзину' }));
    expect(addItem).toHaveBeenCalledWith(expect.anything(), 'M');
  });

  it('shows 10+ sizes in one wrapping row (all of them, none cut)', () => {
    const many = Array.from({ length: 14 }, (_, i) => String(26 + i));
    renderModal(product({ sizes: many, gridSizes: many }));
    expect(labels()).toEqual(many);
    expect(document.querySelector('.size-selector')).not.toBeNull();
  });

  it('falls back to the available sizes when gridSizes is missing (old snapshot)', () => {
    renderModal(product({ sizes: ['M', 'L'], gridSizes: undefined }));
    expect(labels()).toEqual(['M', 'L']);
  });

  it('shows no size selector for a product without sizes, and adds it without a size', () => {
    renderModal(product({ sizes: [], gridSizes: [] }));
    expect(document.querySelector('.quick-view__sizes')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'В корзину' }));
    expect(addItem).toHaveBeenCalledWith(expect.anything(), null);
  });

  it('resets the choice when another product opens', () => {
    const { rerender } = renderModal(product());
    fireEvent.click(button('L'));
    act(() => {
      current = product({ id: '8', name: 'Другой' });
    });
    rerender(
      <MemoryRouter>
        <QuickViewModal />
      </MemoryRouter>
    );
    expect(button('L').getAttribute('aria-pressed')).toBe('false');
  });
});
