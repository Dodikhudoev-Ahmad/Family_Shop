import { CHILD_GENDER, SHOE_SEGMENT, type ApiChildGender, type ApiShoeSegment } from '../types/api';
import type { Product } from '../types/product';

/** The "who are the shoes for" choices of the catalog: boys and girls (kids' sizes) and teens. */
export type ShoeAudience = 'boys' | 'girls' | 'teens';

const ORDER: ShoeAudience[] = ['boys', 'girls', 'teens'];

export function parseAudience(value: string | null): ShoeAudience | null {
  return ORDER.find((a) => a === value) ?? null;
}

/** The server filter an audience stands for. Teens are one group for both sexes. */
export function audienceQuery(audience: ShoeAudience): { shoeSegment: ApiShoeSegment; childGender?: ApiChildGender } {
  switch (audience) {
    case 'boys':
      return { shoeSegment: SHOE_SEGMENT.Kids, childGender: CHILD_GENDER.Boy };
    case 'girls':
      return { shoeSegment: SHOE_SEGMENT.Kids, childGender: CHILD_GENDER.Girl };
    case 'teens':
      return { shoeSegment: SHOE_SEGMENT.Teen };
  }
}

function audienceOf(product: Product): ShoeAudience | null {
  if (product.shoeSegment === 'teen') return 'teens';
  if (product.shoeSegment === 'kids' && product.childGender) return product.childGender === 'boy' ? 'boys' : 'girls';
  return null;
}

/** The audiences that have at least one product among what is being browsed (category and, once picked, type). */
export function availableAudiences(
  products: Product[],
  categoryId: string | null | undefined,
  productType: string | null | undefined,
): ShoeAudience[] {
  const present = new Set<ShoeAudience>();
  for (const p of products) {
    if (categoryId && p.categoryId !== categoryId) continue;
    if (productType && p.productType !== productType) continue;
    const audience = audienceOf(p);
    if (audience) present.add(audience);
  }
  return ORDER.filter((a) => present.has(a));
}
