import type { Product } from '../types/product';

/** The i18n key (under `shoes.audience`) naming who the shoes are for; null for anything that has no segment.
 * Adult shoes need no badge: the category already says it. A kids' or teen shoe without a boy/girl chosen yet gets
 * the plain group name. */
export function audienceKey(product: Pick<Product, 'shoeSegment' | 'childGender'>): string | null {
  const { shoeSegment: segment, childGender: gender } = product;
  if (segment !== 'kids' && segment !== 'teen') return null;
  const base = segment === 'kids' ? 'kids' : 'teen';
  return gender ? `${base}${gender === 'boy' ? 'Boy' : 'Girl'}` : base;
}

/** First and last size of a shoe grid ("27", "37") from the sizes the server sent, or null for a grid of fewer than two. */
export function shoeRange(gridSizes: string[] | undefined): { from: string; to: string } | null {
  if (!gridSizes || gridSizes.length < 2) return null;
  const sorted = [...gridSizes].sort((a, b) => Number(a) - Number(b));
  return { from: sorted[0], to: sorted[sorted.length - 1] };
}
