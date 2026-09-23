import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Product } from '../types/product';
import { ApiError, validatePromoCode, type PromoCodeApplicationDto } from '../lib/api';
import { useToast } from './ToastContext';

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

function loadStoredLines(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
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

  const addItem = (product: Product, size: string | null, quantity = 1) => {
    const key = `${product.id}__${size ?? 'onesize'}`;
    const existing = lines.find((l) => l.key === key);
    const cappedQuantity = Math.min((existing?.quantity ?? 0) + quantity, product.stock) - (existing?.quantity ?? 0);

    if (cappedQuantity <= 0) {
      showToast(`Доступно только ${product.stock} шт «${product.name}»`, 'error');
      return;
    }

    setLines((prev) => {
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + cappedQuantity } : l));
      }
      return [...prev, { key, product, size, quantity: cappedQuantity }];
    });
    setBump((b) => b + 1);
    showToast(
      cappedQuantity < quantity
        ? `Доступно только ${product.stock} шт — добавлено ${cappedQuantity}`
        : `«${product.name}» добавлен в корзину`
    );
  };

  const updateQuantity = (key: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.key !== key)
        : prev.map((l) => (l.key === key ? { ...l, quantity: Math.min(quantity, l.product.stock) } : l))
    );
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
      setPromoError(err instanceof ApiError ? err.message : 'Не удалось применить промокод.');
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
