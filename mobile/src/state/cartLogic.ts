import type { Product } from '../lib/types';
import { LIMITS } from '../lib/validation';

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

/** Why fewer units than asked were added: the product's stock, the server's 50-per-line cap, or the 50-line cap. */
export type AddLimit = 'stock' | 'line-quantity' | 'lines' | null;

export interface AddResult {
  lines: CartLine[];
  /** How many units were actually added (0 when a cap was already reached). */
  added: number;
  limit: AddLimit;
}

/** The stock cap is aggregated per product, not per line - otherwise combining sizes would exceed it.
 * Two more caps mirror what the server refuses in an order: 50 units per line, 50 lines. */
export function addToCart(lines: CartLine[], product: CartProductInfo, size: string | null, quantity = 1): AddResult {
  const key = lineKey(product.id, size);
  const existing = lines.find((l) => l.key === key);

  if (!existing && lines.length >= LIMITS.orderLines) return { lines, added: 0, limit: 'lines' };

  const stockRoom = remainingStock(lines, product.id, product.stock);
  const lineRoom = Math.max(0, LIMITS.lineQuantity - (existing?.quantity ?? 0));
  const room = Math.min(stockRoom, lineRoom);
  const added = Math.max(0, Math.min(quantity, room));
  const limit: AddLimit = added >= quantity ? null : stockRoom <= lineRoom ? 'stock' : 'line-quantity';
  if (added === 0) return { lines, added: 0, limit };

  if (existing) {
    return {
      lines: lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + added, stock: product.stock, price: product.price } : l)),
      added,
      limit,
    };
  }

  return {
    lines: [
      ...lines,
      { key, productId: product.id, name: product.name, image: product.image, price: product.price, size, quantity: added, stock: product.stock },
    ],
    added,
    limit,
  };
}

export function setQuantity(lines: CartLine[], key: string, quantity: number): CartLine[] {
  if (quantity <= 0) return lines.filter((l) => l.key !== key);
  return lines.map((l) => {
    if (l.key !== key) return l;
    const room = Math.max(0, l.stock - quantityOfProduct(lines, l.productId, key));
    return { ...l, quantity: Math.min(quantity, room, LIMITS.lineQuantity) };
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
    if (typeof c.price !== 'number' || !Number.isFinite(c.price) || c.price < 0) continue;
    if (typeof c.quantity !== 'number' || !Number.isFinite(c.quantity) || c.quantity < 1) continue;
    const size = typeof c.size === 'string' && c.size.length > 0 && c.size.length <= LIMITS.size ? c.size : null;
    const key = lineKey(c.productId, size);
    const line: CartLine = {
      key,
      productId: c.productId,
      name: c.name,
      image: typeof c.image === 'string' ? c.image : undefined,
      price: c.price,
      size,
      quantity: Math.min(Math.floor(c.quantity), LIMITS.lineQuantity),
      stock: typeof c.stock === 'number' && Number.isFinite(c.stock) ? c.stock : Number.MAX_SAFE_INTEGER,
    };
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, quantity: Math.min(prev.quantity + line.quantity, LIMITS.lineQuantity) } : line);
  }
  // The server takes at most 50 lines per order; anything beyond that in a damaged save is dropped.
  return [...merged.values()].slice(0, LIMITS.orderLines);
}

export interface ReconcileResult {
  lines: CartLine[];
  /** Lines taken out because the product is gone or sold out. */
  removed: number;
  /** True when a price, stock or quantity was brought in line with the catalogue. */
  changed: boolean;
}

/**
 * Brings saved lines in line with the live catalogue: current name, photo, price and stock, quantities cut to
 * the stock left (shared by all sizes of a product), and lines of vanished / sold-out products removed.
 * The price shown in the cart is only an estimate - the server recalculates it from the catalogue.
 */
export function reconcileCart(lines: CartLine[], catalogue: Product[]): ReconcileResult {
  const byId = new Map(catalogue.map((p) => [p.id, p]));
  const budget = new Map<string, number>();
  let removed = 0;
  let changed = false;
  const next: CartLine[] = [];

  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product || product.stock <= 0) {
      removed += 1;
      continue;
    }
    // A size the admin no longer sells can't be ordered (the server answers size_unavailable): the line goes, with the
    // usual notice. A sizeless product takes no size, and a sized one needs one. Line keys are left as they are.
    const sizeSold = product.sizes.length === 0 ? line.size === null : line.size !== null && product.sizes.includes(line.size);
    if (!sizeSold) {
      removed += 1;
      continue;
    }
    const left = budget.get(product.id) ?? product.stock;
    const quantity = Math.min(line.quantity, left, LIMITS.lineQuantity);
    if (quantity <= 0) {
      removed += 1;
      continue;
    }
    budget.set(product.id, left - quantity);
    const price = product.discountPrice ?? product.price;
    const image = product.images[0] ?? line.image;
    if (quantity !== line.quantity || price !== line.price || product.stock !== line.stock) changed = true;
    next.push({ ...line, name: product.name, image, price, stock: product.stock, quantity });
  }
  return { lines: next, removed, changed: changed || removed > 0 };
}
