import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilterPanel, type Filters } from './FilterPanel';

vi.mock('../../context/CategoriesContext', () => ({ useCategories: () => ({ categories: [] }) }));

afterEach(cleanup);

const filters: Filters = { categoryId: null, size: null, priceRange: [0, 100], discountOnly: false };

const renderPanel = (over: Partial<Parameters<typeof FilterPanel>[0]> = {}) =>
  render(<FilterPanel filters={filters} onChange={vi.fn()} availableSizes={[]} priceBounds={[0, 100]} {...over} />);

describe('FilterPanel type block', () => {
  it('lists the given types with "Все" and marks the selected one', () => {
    renderPanel({ productTypes: ['Кроссовки', 'Брюки'], productType: 'Кроссовки', onProductTypeChange: vi.fn() });
    expect(screen.getByText('Тип')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Кроссовки' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Брюки' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports a selection, and null for "Все"', () => {
    const onProductTypeChange = vi.fn();
    renderPanel({ productTypes: ['Кроссовки', 'Брюки'], productType: null, onProductTypeChange });
    fireEvent.click(screen.getByRole('button', { name: 'Брюки' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Все' }).at(-1)!);
    expect(onProductTypeChange).toHaveBeenNthCalledWith(1, 'Брюки');
    expect(onProductTypeChange).toHaveBeenNthCalledWith(2, null);
  });

  it('is hidden when a category has fewer than two types to choose from', () => {
    renderPanel({ productTypes: ['Кроссовки'], onProductTypeChange: vi.fn() });
    expect(screen.queryByText('Тип')).not.toBeInTheDocument();
  });
});
