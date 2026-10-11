import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { CategoryMegaMenu } from './CategoryMegaMenu';
import type { Category } from '../../types/product';

afterEach(cleanup);

const category = (id: string, slug: string, name: string): Category => ({ id, slug, name, hasSizes: false });

const categories = [
  category('1', 'women', 'Женское'),
  category('4', 'bytovaya-tehnika', 'Бытовая техника'),
  category('5', 'posuda', 'Посуда'),
  category('8', 'dom-i-byt', 'Дом и быт'),
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

  it('still renders when the server has not got the category yet', () => {
    render(
      <MemoryRouter>
        <CategoryMegaMenu categories={categories.slice(0, 3)} isLoading={false} />
      </MemoryRouter>
    );
    expect(screen.queryByRole('link', { name: 'Дом и быт', hidden: true })).not.toBeInTheDocument();
  });
});
