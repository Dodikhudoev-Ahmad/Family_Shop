import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { CategoryMegaMenu } from './CategoryMegaMenu';
import type { Category } from '../../types/product';

afterEach(cleanup);

const category = (id: string, slug: string, name: string, sortOrder = 0): Category => ({ id, slug, name, hasSizes: false, sortOrder });

// In the order the server sends them (sortOrder, then id).
const categories = [
  category('1', 'women', 'Женское', 10),
  category('4', 'bytovaya-tehnika', 'Бытовая техника', 40),
  category('8', 'dom-i-byt', 'Дом и быт', 50),
  category('5', 'posuda', 'Посуда', 60),
];

describe('CategoryMegaMenu', () => {
  it('lists "Дом и быт" in the home column, right after appliances', () => {
    render(
      <MemoryRouter>
        <CategoryMegaMenu categories={categories} isLoading={false} />
      </MemoryRouter>
    );

    const link = screen.getByRole('link', { name: 'Дом и быт', hidden: true });
    expect(link).toHaveAttribute('href', '/catalog/dom-i-byt');

    const column = link.closest('.mega-menu__col') as HTMLElement;
    const names = within(column).getAllByRole('link', { hidden: true }).map((a) => a.textContent);
    expect(names).toEqual(['Бытовая техника', 'Дом и быт', 'Посуда']);
  });

  it('orders the links inside a column by the order the server sent, not by a fixed list', () => {
    // dom-i-byt placed first by the server: the menu follows it
    const reordered = [
      category('8', 'dom-i-byt', 'Дом и быт', 5),
      category('4', 'bytovaya-tehnika', 'Бытовая техника', 40),
      category('5', 'posuda', 'Посуда', 60),
    ];
    render(
      <MemoryRouter>
        <CategoryMegaMenu categories={reordered} isLoading={false} />
      </MemoryRouter>
    );

    const column = screen.getByRole('link', { name: 'Дом и быт', hidden: true }).closest('.mega-menu__col') as HTMLElement;
    expect(within(column).getAllByRole('link', { hidden: true }).map((a) => a.textContent)).toEqual([
      'Дом и быт',
      'Бытовая техника',
      'Посуда',
    ]);
  });

  it('still renders when the server has not got the category yet', () => {
    render(
      <MemoryRouter>
        <CategoryMegaMenu categories={categories.filter((c) => c.slug !== 'dom-i-byt')} isLoading={false} />
      </MemoryRouter>
    );
    expect(screen.queryByRole('link', { name: 'Дом и быт', hidden: true })).not.toBeInTheDocument();
  });
});
