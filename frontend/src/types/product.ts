export type Gender = 'female' | 'male' | 'kids';

export interface Category {
  id: string;
  name: string;
  slug: string;
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
  sizes: string[];
  isNew?: boolean;
  isBestseller?: boolean;
  createdAt: string;
}
