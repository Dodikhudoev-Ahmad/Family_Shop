import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import i18n from '../i18n';
import { ApiError } from '../lib/api/errors';
import { validatePromoCode } from '../lib/api/endpoints';
import type { PromoCodeApplicationDto } from '../lib/api/types';
import { validatePromoCodeInput } from '../lib/validation';
import {
  addToCart,
  parseStoredCart,
  reconcileCart,
  removeLine,
  setQuantity as setLineQuantity,
  totalItems,
  totalPrice,
  type AddLimit,
  type CartLine,
  type CartProductInfo,
} from './cartLogic';
import { useProducts } from './ProductsContext';

export const CART_STORAGE_KEY = 'fs.cart';

export interface AddItemResult {
  /** Units really added (0 when a cap was already reached). */
  added: number;
  limit: AddLimit;
}

interface CartContextValue {
  lines: CartLine[];
  totalItems: number;
  /** Estimate from the prices the app knows. The server prices the order itself. */
  totalPrice: number;
  promo: PromoCodeApplicationDto | null;
  promoError: string | null;
  isApplyingPromo: boolean;
  /** What the server said the total would be with the promo code, else the plain subtotal. */
  finalTotal: number;
  /** How many lines were taken out because their product sold out or disappeared, until dismissed. */
  removedNotice: number;
  dismissRemovedNotice: () => void;
  addItem: (product: CartProductInfo, size: string | null, quantity?: number) => AddItemResult;
  setQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  applyPromoCode: (code: string) => Promise<void>;
  clearPromoCode: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { products, isLoading: productsLoading } = useProducts();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [removedNotice, setRemovedNotice] = useState(0);
  const [promo, setPromo] = useState<PromoCodeApplicationDto | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const appliedForSubtotal = useRef<number | null>(null);
  const promoRequest = useRef(0);
  const latest = useRef<CartLine[]>([]);
  latest.current = lines;

  // Restore (and normalise) the saved cart once.
  useEffect(() => {
    AsyncStorage.getItem(CART_STORAGE_KEY)
      .then((raw) => {
        const restored = parseStoredCart(raw);
        latest.current = restored;
        setLines(restored);
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return; // never overwrite the saved cart with the initial empty one
    AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines)).catch(() => undefined);
  }, [lines, hydrated]);

  // Once the catalogue is known, bring saved lines up to date (price, stock, sold-out products).
  useEffect(() => {
    if (!hydrated || productsLoading || products.length === 0) return;
    const result = reconcileCart(latest.current, products);
    if (result.changed) {
      latest.current = result.lines;
      setLines(result.lines);
    }
    if (result.removed > 0) setRemovedNotice((n) => n + result.removed);
  }, [hydrated, productsLoading, products]);

  const clearPromoCode = useCallback(() => {
    promoRequest.current += 1;
    setPromo(null);
    setPromoError(null);
    setIsApplyingPromo(false);
    appliedForSubtotal.current = null;
  }, []);

  const addItem = useCallback((product: CartProductInfo, size: string | null, quantity = 1): AddItemResult => {
    const result = addToCart(latest.current, product, size, quantity);
    latest.current = result.lines;
    setLines(result.lines);
    return { added: result.added, limit: result.limit };
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => setLines((prev) => setLineQuantity(prev, key, quantity)), []);
  const removeItem = useCallback((key: string) => setLines((prev) => removeLine(prev, key)), []);

  const clear = useCallback(() => {
    latest.current = [];
    setLines([]);
    clearPromoCode();
  }, [clearPromoCode]);

  const subtotal = totalPrice(lines);

  // A promo's discount was computed for one subtotal: when the cart changes, drop it rather than show a stale discount.
  useEffect(() => {
    if (promo && appliedForSubtotal.current !== null && appliedForSubtotal.current !== subtotal) clearPromoCode();
  }, [subtotal, promo, clearPromoCode]);

  const applyPromoCode = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      const invalid = validatePromoCodeInput(trimmed);
      if (invalid) {
        setPromoError(i18n.t('mobile.tooLong', { n: 50 }));
        return;
      }
      const mine = ++promoRequest.current;
      setIsApplyingPromo(true);
      setPromoError(null);
      try {
        const result = await validatePromoCode(trimmed, subtotal);
        if (mine !== promoRequest.current) return;
        setPromo(result);
        appliedForSubtotal.current = subtotal;
      } catch (e: unknown) {
        if (mine !== promoRequest.current) return;
        setPromo(null);
        appliedForSubtotal.current = null;
        setPromoError(e instanceof ApiError ? e.message : i18n.t('promo.error'));
      } finally {
        if (mine === promoRequest.current) setIsApplyingPromo(false);
      }
    },
    [subtotal]
  );

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      totalItems: totalItems(lines),
      totalPrice: subtotal,
      promo,
      promoError,
      isApplyingPromo,
      finalTotal: promo ? promo.finalTotal : subtotal,
      removedNotice,
      dismissRemovedNotice: () => setRemovedNotice(0),
      addItem,
      setQuantity,
      removeItem,
      clear,
      applyPromoCode,
      clearPromoCode,
    }),
    [lines, subtotal, promo, promoError, isApplyingPromo, removedNotice, addItem, setQuantity, removeItem, clear, applyPromoCode, clearPromoCode]
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
