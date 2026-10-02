import { BADGE_MAX, badgeText, favoritesView, parseFavoriteIds } from '../src/lib/favorites';
import { addSearchQuery, parseSearchHistory, removeSearchQuery, searchTerm, SEARCH_HISTORY_MAX } from '../src/lib/searchHistory';
import { validateReview } from '../src/lib/validation';
import type { Product } from '../src/lib/types';

const product = (id: string, stock = 5): Product => ({ id, name: `p${id}`, stock }) as unknown as Product;

describe('count badge (same rule as the website)', () => {
  it('shows nothing for zero or garbage, the number up to 99, and "99+" above', () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(-3)).toBeNull();
    expect(badgeText(Number.NaN)).toBeNull();
    expect(badgeText(1)).toBe('1');
    expect(badgeText(BADGE_MAX)).toBe('99');
    expect(badgeText(BADGE_MAX + 1)).toBe('99+');
    expect(badgeText(1000)).toBe('99+');
  });
});

describe('favourites', () => {
  it('reads a saved list, dropping duplicates and anything that is not a string id', () => {
    expect(parseFavoriteIds('["1","2","1",3,null,"",{"a":1}]')).toEqual(['1', '2']);
    expect(parseFavoriteIds('{"not":"a list"}')).toEqual([]);
    expect(parseFavoriteIds('{broken')).toEqual([]);
    expect(parseFavoriteIds(null)).toEqual([]);
  });

  it('keeps sold-out products, and reports products that were deleted from the shop', () => {
    const view = favoritesView(['3', '7', '1'], [product('1'), product('3', 0)]);
    expect(view.products.map((p) => p.id)).toEqual(['3', '1']); // favourited order, sold-out kept
    expect(view.missingIds).toEqual(['7']);
  });
});

describe('search history', () => {
  it('puts the newest first, ignores empty input, and de-duplicates ignoring case', () => {
    let h: string[] = [];
    h = addSearchQuery(h, 'худи');
    h = addSearchQuery(h, '  кроссовки  ');
    h = addSearchQuery(h, 'ХУДИ');
    h = addSearchQuery(h, '   ');
    expect(h).toEqual(['ХУДИ', 'кроссовки']);
  });

  it('keeps at most eight, dropping the oldest', () => {
    let h: string[] = [];
    for (let i = 1; i <= 12; i++) h = addSearchQuery(h, `запрос ${i}`);
    expect(h).toHaveLength(SEARCH_HISTORY_MAX);
    expect(h[0]).toBe('запрос 12');
    expect(h).not.toContain('запрос 1');
  });

  it('collapses inner whitespace, bounds the length, and removes one entry', () => {
    expect(addSearchQuery([], 'a   b\n c')).toEqual(['a b c']);
    expect(searchTerm('x'.repeat(500))).toHaveLength(100);
    expect(removeSearchQuery(['Худи', 'Куртка'], '  худи ')).toEqual(['Куртка']);
  });

  it('reads a damaged save safely', () => {
    expect(parseSearchHistory('["a","A",5,"",null,"b"]')).toEqual(['a', 'b']);
    expect(parseSearchHistory('nope')).toEqual([]);
  });
});

describe('review form rules (server: rating 1..5, text 1..2000)', () => {
  it('needs a rating and a text, and bounds the text', () => {
    expect(validateReview(0, 'ok')?.key).toBe('reviews.chooseRating');
    expect(validateReview(6, 'ok')?.key).toBe('reviews.chooseRating');
    expect(validateReview(3.5, 'ok')?.key).toBe('reviews.chooseRating');
    expect(validateReview(5, '   ')?.key).toBe('reviews.writeText');
    expect(validateReview(5, 'x'.repeat(2001))?.key).toBe('mobile.tooLong');
    expect(validateReview(5, 'x'.repeat(2000))).toBeNull();
    expect(validateReview(1, 'Нормально')).toBeNull();
  });
});
