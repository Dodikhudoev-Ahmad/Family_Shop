export type Gender = 'female' | 'male' | 'kids';

/** Who a pair of shoes is for; decides its size grid (37 belongs to both kids and teen). */
export type ShoeSegment = 'men' | 'women' | 'kids' | 'teen';
export type ChildGender = 'boy' | 'girl';

export interface Category {
  id: string;
  name: string;
  slug: string;
  hasSizes: boolean;
  /** Display order from the server (ascending, ties by id); absent in fixtures. */
  sortOrder?: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  discountPrice?: number;
  stock: number;
  categoryId: string;
  gender: Gender;
  images: string[];
  /** The sizes that can be bought (the admin's selection within the grid, or the whole grid). */
  sizes: string[];
  /** The whole size grid of the product's type, to show unavailable sizes muted; absent in old snapshots. */
  gridSizes?: string[];
  isNew?: boolean;
  isBestseller?: boolean;
  createdAt: string;
  averageRating: number;
  reviewCount: number;
  productType?: string;
  /** Shoes only. */
  shoeSegment?: ShoeSegment;
  /** Kids' and teen shoes only; absent where the shop has not decided yet. */
  childGender?: ChildGender;
}
