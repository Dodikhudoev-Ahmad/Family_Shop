/** What the catalogue screen opens with: a category tile, a search from home, "all discounts". */
export interface CatalogParams {
  categoryId?: number;
  search?: string;
  discount?: boolean;
  /** Opens the catalogue already sorted this way ("See all" under Bestsellers / New in). */
  sort?: 'new' | 'popular' | 'price-asc' | 'price-desc';
}

export type HomeStackParamList = {
  Home: undefined;
  About: undefined;
  Search: undefined;
  Catalog: CatalogParams | undefined;
  Product: { productId: number };
};

export type CatalogStackParamList = {
  About: undefined;
  Search: undefined;
  Catalog: CatalogParams | undefined;
  Product: { productId: number };
};

export type CartStackParamList = {
  Cart: undefined;
  Checkout: undefined;
  /** `next` is where to go once signed in. */
  Auth: { next?: 'Checkout' } | undefined;
  Product: { productId: number };
};

export type FavoritesStackParamList = {
  Favorites: undefined;
  Product: { productId: number };
};

export type ProfileStackParamList = {
  Profile: undefined;
  Orders: undefined;
  Devices: undefined;
  OrderDetail: { orderId: number };
};

export type RootTabParamList = {
  HomeTab: undefined;
  CatalogTab: undefined;
  CartTab: undefined;
  FavoritesTab: undefined;
  ProfileTab: undefined;
};
