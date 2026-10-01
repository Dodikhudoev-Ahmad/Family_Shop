import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Product } from '../types/product';
import { ApiError, validatePromoCode, type PromoCodeApplicationDto } from '../lib/api';
import { useToast } from './ToastContext';
import i18n from '../i18n';

export interface CartLine {
  key: string;
  product: Product;
  size: string | null;
  quantity: number;
}

interface CartContextValue {
  lines: CartLine[];
  bump: number;
  addItem: (product: Product, size: string | null, quantity?: number) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
  /** Product.Stock is shared across all sizes, so "room left" for a product is stock minus the
   * quantity already in the cart across every size line of that product, not just one line. */
  remainingStock: (product: Product) => number;
  totalItems: number;
  totalPrice: number;
  promo: PromoCodeApplicationDto | null;
  promoError: string | null;
  isApplyingPromo: boolean;
  applyPromoCode: (code: string) => Promise<void>;
  clearPromoCode: () => void;
  finalTotal: number;
}

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = 'family-shop:cart';

// A stored line's key is derived, not trusted - old/malformed entries (missing `key`, `size`
// stored as undefined instead of null, etc.) are rebuilt from `product.id` + `size` the same way
// addItem does, so the productId+size identity described above holds for every line regardless
// of when it was saved.
function normalizeLine(raw: unknown): CartLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<CartLine> & { product?: Product };
  if (!candidate.product || typeof candidate.product.id !== 'string') return null;

  const size = typeof candidate.size === 'string' && candidate.size.length > 0 ? candidate.size : null;
  const quantity = typeof candidate.quantity === 'number' && candidate.quantity > 0 ? candidate.quantity : 0;
  if (quantity <= 0) return null;

  return { key: `${candidate.product.id}__${size ?? 'onesize'}`, product: candidate.product, size, quantity };
}

function loadStoredLines(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Two legacy entries can normalize to the same key (e.g. both missing `size`) - merge
    // instead of letting the later one silently overwrite the earlier one's quantity.
    const merged = new Map<string, CartLine>();
    for (const raw of parsed) {
      const line = normalizeLine(raw);
      if (!line) continue;
      const existing = merged.get(line.key);
      merged.set(line.key, existing ? { ...existing, quantity: existing.quantity + line.quantity } : line);
    }
    return [...merged.values()];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(loadStoredLines);
  const [bump, setBump] = useState(0);
  const [promo, setPromo] = useState<PromoCodeApplicationDto | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const appliedForSubtotal = useRef<number | null>(null);
  const promoRequestId = useRef(0);
  const { showToast } = useToast();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // ignore storage errors (private mode, quota, etc.)
    }
  }, [lines]);

  // Stock is per-product, not per-size - "room left" has to look at every size line of this
  // product together, not just the one line/key being touched.
  const remainingStock = (product: Product): number => {
    const inCart = lines.filter((l) => l.product.id === product.id).reduce((sum, l) => sum + l.quantity, 0);
    return product.stock - inCart;
  };

  const addItem = (product: Product, size: string | null, quantity = 1) => {
    const key = `${product.id}__${size ?? 'onesize'}`;
    const cappedQuantity = Math.max(0, Math.min(quantity, remainingStock(product)));

    if (cappedQuantity <= 0) {
      showToast(i18n.t('cart.onlyAvailable', { stock: product.stock, name: product.name }), 'error');
      return;
    }

    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + cappedQuantity } : l));
      }
      return [...prev, { key, product, size, quantity: cappedQuantity }];
    });
    setBump((b) => b + 1);
    showToast(
      cappedQuantity < quantity
        ? i18n.t('cart.onlyPartial', { left: remainingStock(product), added: cappedQuantity })
        : i18n.t('cart.added', { name: product.name, size: size ? i18n.t('cart.sizeSuffix', { size }) : '' })
    );
  };

  const updateQuantity = (key: string, quantity: number) => {
    setLines((prev) => {
      if (quantity <= 0) return prev.filter((l) => l.key !== key);

      return prev.map((l) => {
        if (l.key !== key) return l;
        // Room for this line = stock minus what the product's OTHER size lines already hold.
        const otherLinesQuantity = prev
          .filter((o) => o.key !== key && o.product.id === l.product.id)
          .reduce((sum, o) => sum + o.quantity, 0);
        const maxForThisLine = Math.max(0, l.product.stock - otherLinesQuantity);
        return { ...l, quantity: Math.min(quantity, maxForThisLine) };
      });
    });
  };

  const removeItem = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const clearPromoCode = () => {
    setPromo(null);
    setPromoError(null);
    appliedForSubtotal.current = null;
  };

  const clearCart = () => {
    setLines([]);
    clearPromoCode();
  };

  const totalItems = useMemo(() => lines.reduce((sum, l) => sum + l.quantity, 0), [lines]);
  const totalPrice = useMemo(
    () => lines.reduce((sum, l) => sum + (l.product.discountPrice ?? l.product.price) * l.quantity, 0),
    [lines]
  );

  // A promo's discount was computed for a specific subtotal - if the cart changes afterwards
  // (quantity edited, item removed), silently drop it rather than show a stale discount.
  useEffect(() => {
    if (promo && appliedForSubtotal.current !== null && appliedForSubtotal.current !== totalPrice) {
      clearPromoCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPrice]);

  const applyPromoCode = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    const requestId = ++promoRequestId.current;
    setIsApplyingPromo(true);
    setPromoError(null);
    try {
      const result = await validatePromoCode(trimmed, totalPrice);
      if (promoRequestId.current !== requestId) return;
      setPromo(result);
      appliedForSubtotal.current = totalPrice;
    } catch (err) {
      if (promoRequestId.current !== requestId) return;
      setPromo(null);
      appliedForSubtotal.current = null;
      setPromoError(err instanceof ApiError ? err.message : i18n.t('promo.error'));
    } finally {
      if (promoRequestId.current === requestId) setIsApplyingPromo(false);
    }
  };

  const finalTotal = promo ? promo.finalTotal : totalPrice;

  return (
    <CartContext.Provider
      value={{
        lines,
        bump,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        remainingStock,
        totalItems,
        totalPrice,
        promo,
        promoError,
        isApplyingPromo,
        applyPromoCode,
        clearPromoCode,
        finalTotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
