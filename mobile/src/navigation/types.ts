export type CatalogStackParamList = {
  Home: undefined;
  Category: { categoryId: number; slug: string; name: string };
  Product: { productId: number };
  Cart: undefined;
  Checkout: undefined;
};

export type CartStackParamList = {
  Cart: undefined;
  Checkout: undefined;
  Product: { productId: number };
};

export type FavoritesStackParamList = {
  Favorites: undefined;
  Product: { productId: number };
};

export type ProfileStackParamList = {
  Profile: undefined;
};

export type RootTabParamList = {
  CatalogTab: undefined;
  CartTab: undefined;
  FavoritesTab: undefined;
  ProfileTab: undefined;
};
