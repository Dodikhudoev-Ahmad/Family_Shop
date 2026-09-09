export const LOW_STOCK_THRESHOLD = 5;

export function isLowStock(stock: number) {
  return stock > 0 && stock <= LOW_STOCK_THRESHOLD;
}

export function isOutOfStock(stock: number) {
  return stock <= 0;
}
