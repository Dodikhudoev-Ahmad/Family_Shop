import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Product } from '../types/product';
import { useToast } from './ToastContext';

export interface CartLine {
  key: string;
  product: Product;
  size: string;
  quantity: number;
}

interface CartContextValue {
  lines: CartLine[];
  isOpen: boolean;
  bump: number;
  openCart: () => void;
  closeCart: () => void;
  addItem: (product: Product, size: string, quantity?: number) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
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
  const [isOpen, setIsOpen] = useState(false);
  const [bump, setBump] = useState(0);
  const { showToast } = useToast();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // ignore storage errors (private mode, quota, etc.)
    }
  }, [lines]);

  const addItem = (product: Product, size: string, quantity = 1) => {
    const key = `${product.id}__${size}`;
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l));
      }
      return [...prev, { key, product, size, quantity }];
    });
    setBump((b) => b + 1);
    showToast(`«${product.name}» добавлен в корзину`);
  };

  const updateQuantity = (key: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, quantity } : l))
    );
  };

  const removeItem = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const clearCart = () => setLines([]);

  const totalItems = useMemo(() => lines.reduce((sum, l) => sum + l.quantity, 0), [lines]);
  const totalPrice = useMemo(
    () => lines.reduce((sum, l) => sum + (l.product.discountPrice ?? l.product.price) * l.quantity, 0),
    [lines]
  );

  return (
    <CartContext.Provider
      value={{
        lines,
        isOpen,
        bump,
        openCart: () => setIsOpen(true),
        closeCart: () => setIsOpen(false),
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        totalItems,
        totalPrice,
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
