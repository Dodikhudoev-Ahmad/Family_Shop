import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api/client';
import type { AuthUser } from '../lib/api/types';

interface AuthContextValue {
  user: AuthUser | null;
  /** True until the stored session (if any) has been checked at startup. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // The server ended the session (refresh rejected, logout elsewhere): reflect it in the UI.
    const unsubscribe = api.onSignedOut(() => {
      if (active) setUser(null);
    });

    api
      .restoreSession()
      .then((restored) => {
        if (active) setUser(restored);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setUser(await api.login(email, password));
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    setUser(await api.register(email, password, name));
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const logoutAll = useCallback(async () => {
    try {
      await api.logoutAll();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, register, logout, logoutAll }),
    [user, isLoading, login, register, logout, logoutAll]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
