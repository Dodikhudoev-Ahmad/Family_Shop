import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchOrders } from '../lib/api/endpoints';
import type { OrderDto } from '../lib/api/types';

/**
 * The signed-in user's orders. The endpoint takes no user id: the server reads it from the access token,
 * so only the caller's own orders can ever come back.
 */
export function useOrders() {
  const [orders, setOrders] = useState<OrderDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchOrders();
      if (mine === generation.current) setOrders(result);
    } catch (e: unknown) {
      if (mine === generation.current) setError(e instanceof Error ? e.message : 'error');
    } finally {
      if (mine === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);

  return { orders, error, loading, reload: load };
}
