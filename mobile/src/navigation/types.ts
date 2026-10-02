/** What the catalogue screen opens with: a category tile, a search from home, "all discounts". */
export interface CatalogParams {
  categoryId?: number;
  search?: string;
  discount?: boolean;
}

export type HomeStackParamList = {
  Home: undefined;
  Search: undefined;
  Catalog: CatalogParams | undefined;
  Product: { productId: number };
};

export type CatalogStackParamList = {
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
