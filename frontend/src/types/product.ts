export type Gender = 'female' | 'male' | 'kids';

export interface Category {
  id: string;
  name: string;
  slug: string;
  hasSizes: boolean;
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
}
