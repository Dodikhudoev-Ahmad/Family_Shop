import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  addToCart,
  parseStoredCart,
  removeLine,
  setQuantity as setLineQuantity,
  totalItems,
  totalPrice,
  type CartLine,
  type CartProductInfo,
} from './cartLogic';

const CART_STORAGE_KEY = 'fs.cart';

interface CartContextValue {
  lines: CartLine[];
  totalItems: number;
  totalPrice: number;
  /** Returns how many units were really added (0 when the stock cap is reached). */
  addItem: (product: CartProductInfo, size: string | null, quantity?: number) => number;
  setQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const hydrated = useRef(false);
  const latest = useRef<CartLine[]>([]);
  latest.current = lines;

  useEffect(() => {
    AsyncStorage.getItem(CART_STORAGE_KEY)
      .then((raw) => setLines(parseStoredCart(raw)))
      .catch(() => undefined)
      .finally(() => {
        hydrated.current = true;
      });
  }, []);

  useEffect(() => {
    if (!hydrated.current) return; // never overwrite the saved cart with the initial empty one
    AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines)).catch(() => undefined);
  }, [lines]);

  const addItem = useCallback((product: CartProductInfo, size: string | null, quantity = 1): number => {
    const result = addToCart(latest.current, product, size, quantity);
    latest.current = result.lines;
    setLines(result.lines);
    return result.added;
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => setLines((prev) => setLineQuantity(prev, key, quantity)), []);
  const removeItem = useCallback((key: string) => setLines((prev) => removeLine(prev, key)), []);
  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(
    () => ({ lines, totalItems: totalItems(lines), totalPrice: totalPrice(lines), addItem, setQuantity, removeItem, clear }),
    [lines, addItem, setQuantity, removeItem, clear]
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
