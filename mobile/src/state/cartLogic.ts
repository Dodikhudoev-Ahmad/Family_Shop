/** Pure cart rules (no React, no storage) so they can be tested on their own. */

export interface CartLine {
  /** `${productId}__${size}` - one product in two sizes is two lines. */
  key: string;
  productId: string;
  name: string;
  image?: string;
  /** Effective unit price (the discounted one when there is a discount). */
  price: number;
  size: string | null;
  quantity: number;
  /** Product.Stock is shared across all sizes of a product. */
  stock: number;
}

export interface CartProductInfo {
  id: string;
  name: string;
  image?: string;
  price: number;
  stock: number;
}

export function lineKey(productId: string, size: string | null): string {
  return `${productId}__${size ?? 'onesize'}`;
}

/** Quantity of one product already in the cart across every size line, optionally excluding one line. */
export function quantityOfProduct(lines: CartLine[], productId: string, exceptKey?: string): number {
  return lines.filter((l) => l.productId === productId && l.key !== exceptKey).reduce((sum, l) => sum + l.quantity, 0);
}

/** Units of a product that can still be added: its stock minus what every size line already holds. */
export function remainingStock(lines: CartLine[], productId: string, stock: number): number {
  return Math.max(0, stock - quantityOfProduct(lines, productId));
}

export interface AddResult {
  lines: CartLine[];
  /** How many units were actually added (0 when the stock cap was already reached). */
  added: number;
}

/** The stock cap is aggregated per product, not per line - otherwise combining sizes would exceed it. */
export function addToCart(lines: CartLine[], product: CartProductInfo, size: string | null, quantity = 1): AddResult {
  const key = lineKey(product.id, size);
  const room = remainingStock(lines, product.id, product.stock);
  const added = Math.max(0, Math.min(quantity, room));
  if (added === 0) return { lines, added: 0 };

  const existing = lines.find((l) => l.key === key);
  if (existing) {
    return {
      lines: lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + added, stock: product.stock, price: product.price } : l)),
      added,
    };
  }

  return {
    lines: [
      ...lines,
      { key, productId: product.id, name: product.name, image: product.image, price: product.price, size, quantity: added, stock: product.stock },
    ],
    added,
  };
}

export function setQuantity(lines: CartLine[], key: string, quantity: number): CartLine[] {
  if (quantity <= 0) return lines.filter((l) => l.key !== key);
  return lines.map((l) => {
    if (l.key !== key) return l;
    const room = Math.max(0, l.stock - quantityOfProduct(lines, l.productId, key));
    return { ...l, quantity: Math.min(quantity, room) };
  });
}

export function removeLine(lines: CartLine[], key: string): CartLine[] {
  return lines.filter((l) => l.key !== key);
}

export function totalItems(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

export function totalPrice(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
}

/** Reads whatever was saved, dropping anything malformed instead of crashing the app on start. */
export function parseStoredCart(raw: string | null): CartLine[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const merged = new Map<string, CartLine>();
  for (const item of parsed as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const c = item as Partial<CartLine>;
    if (typeof c.productId !== 'string' || typeof c.name !== 'string') continue;
    if (typeof c.price !== 'number' || typeof c.quantity !== 'number' || c.quantity <= 0) continue;
    const size = typeof c.size === 'string' && c.size.length > 0 ? c.size : null;
    const key = lineKey(c.productId, size);
    const line: CartLine = {
      key,
      productId: c.productId,
      name: c.name,
      image: typeof c.image === 'string' ? c.image : undefined,
      price: c.price,
      size,
      quantity: Math.floor(c.quantity),
      stock: typeof c.stock === 'number' ? c.stock : Number.MAX_SAFE_INTEGER,
    };
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, quantity: prev.quantity + line.quantity } : line);
  }
  return [...merged.values()];
}
