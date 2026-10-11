import { describe, expect, it } from 'vitest';
import { sortCategories } from './CategoriesContext';
import { mapCategory } from '../lib/mappers';

describe('category order', () => {
  it('mapCategory carries sortOrder, 0 when the server did not send it', () => {
    expect(mapCategory({ id: 1, name: 'A', slug: 'a', parentCategoryId: null, hasSizes: true, sortOrder: 40 }).sortOrder).toBe(40);
    expect(mapCategory({ id: 1, name: 'A', slug: 'a', parentCategoryId: null, hasSizes: true }).sortOrder).toBe(0);
  });

  it('sorts by sortOrder, then by id', () => {
    const list = [
      { id: '3', name: 'C', slug: 'c', hasSizes: true, sortOrder: 20 },
      { id: '9', name: 'Z', slug: 'z', hasSizes: true, sortOrder: 10 },
      { id: '2', name: 'B', slug: 'b', hasSizes: true, sortOrder: 20 },
    ];
    expect(sortCategories(list).map((c) => c.slug)).toEqual(['z', 'b', 'c']);
  });

  it('does not mutate its input', () => {
    const list = [
      { id: '2', name: 'B', slug: 'b', hasSizes: true, sortOrder: 2 },
      { id: '1', name: 'A', slug: 'a', hasSizes: true, sortOrder: 1 },
    ];
    sortCategories(list);
    expect(list[0].slug).toBe('b');
  });
});
