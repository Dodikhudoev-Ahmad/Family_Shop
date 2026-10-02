import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api/client';
import type { SessionDto } from '../lib/api/types';

/** The user's signed-in devices (GET /auth/sessions). The current one is flagged by the server (`isCurrent`). */
export function useSessions() {
  const [sessions, setSessions] = useState<SessionDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const mine = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const result = await api.fetchSessions();
      if (mine === generation.current) setSessions(result);
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

  /** Ends one OTHER device's session and refreshes the list. A session that is already gone (404) is simply refreshed away. */
  const revoke = useCallback(
    async (sessionId: string) => {
      try {
        await api.revokeSession(sessionId);
      } catch (e: unknown) {
        const status = (e as { status?: number }).status;
        if (status !== 404) throw e;
      }
      await load();
    },
    [load]
  );

  return { sessions, error, loading, reload: load, revoke };
}
