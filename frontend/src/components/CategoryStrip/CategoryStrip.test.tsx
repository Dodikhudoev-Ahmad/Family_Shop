import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CategoryStrip } from './CategoryStrip';

vi.mock('../../context/CategoriesContext', () => ({
  useCategories: () => ({
    categories: [
      { id: '1', name: 'Мужское', slug: 'men', parentCategoryId: null, hasSizes: true },
      { id: '2', name: 'Женское', slug: 'women', parentCategoryId: null, hasSizes: true },
      { id: '3', name: 'Детское', slug: 'kids', parentCategoryId: null, hasSizes: true },
    ],
  }),
}));

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

const renderStrip = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <CategoryStrip />
      <Where />
    </MemoryRouter>
  );

// jsdom has no Element.scrollTo; the strip uses it to bring the active tab into view.
beforeAll(() => {
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
});

afterEach(cleanup);

describe('category tabs in the header', () => {
  it('renders "Все" first, then the categories', () => {
    renderStrip('/');
    const tabs = screen.getAllByRole('link').map((a) => a.textContent);
    expect(tabs).toEqual(['Все', 'Мужское', 'Женское', 'Детское']);
  });

  it('marks "Все" as the current tab on the home page and in the unfiltered catalog', () => {
    renderStrip('/');
    expect(screen.getByRole('link', { name: 'Все' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Все' })).toHaveAttribute('aria-current', 'page');
    cleanup();
    renderStrip('/catalog');
    expect(screen.getByRole('link', { name: 'Все' })).toHaveClass('active');
  });

  it('switches the category on click and moves the active mark', () => {
    renderStrip('/');
    fireEvent.click(screen.getByRole('link', { name: 'Женское' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/catalog/women');
    expect(screen.getByRole('link', { name: 'Женское' })).toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Все' })).not.toHaveClass('active');
    expect(screen.getByRole('link', { name: 'Мужское' })).not.toHaveClass('active');
  });

  it('"Все" leads back to the catalog from a category', () => {
    renderStrip('/catalog/kids');
    expect(screen.getByRole('link', { name: 'Детское' })).toHaveClass('active');
    fireEvent.click(screen.getByRole('link', { name: 'Все' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/catalog');
    expect(screen.getByRole('link', { name: 'Все' })).toHaveClass('active');
  });
});
