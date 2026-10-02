import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../lib/api/client';
import type { AuthUser } from '../lib/api/types';

interface AuthContextValue {
  user: AuthUser | null;
  /** True until the stored session (if any) has been checked at startup. */
  isLoading: boolean;
  /** True when the SERVER ended the session (refresh rejected, signed out elsewhere) - not on a voluntary logout. */
  sessionEnded: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  /** Deletes the account for good (needs the current password). Throws the server's refusal (wrong password, admin). */
  deleteAccount: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionEnded, setSessionEnded] = useState(false);
  // The token store reports every wipe, including our own logout - this tells the two apart.
  const voluntary = useRef(false);

  useEffect(() => {
    let active = true;

    // The server ended the session (refresh rejected, logout elsewhere): reflect it in the UI.
    const unsubscribe = api.onSignedOut(() => {
      if (!active) return;
      setUser(null);
      if (!voluntary.current) setSessionEnded(true);
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
    setSessionEnded(false);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    setUser(await api.register(email, password, name));
    setSessionEnded(false);
  }, []);

  const endVoluntarily = useCallback(async (action: () => Promise<void>) => {
    voluntary.current = true;
    try {
      await action();
    } finally {
      setUser(null);
      setSessionEnded(false);
      voluntary.current = false;
    }
  }, []);

  const logout = useCallback(() => endVoluntarily(() => api.logout()), [endVoluntarily]);
  const logoutAll = useCallback(() => endVoluntarily(() => api.logoutAll()), [endVoluntarily]);

  // Unlike logout, a refusal (wrong password) must leave the user signed in: only success ends the session.
  const deleteAccount = useCallback(async (password: string) => {
    voluntary.current = true;
    try {
      await api.deleteAccount(password);
    } catch (e: unknown) {
      voluntary.current = false;
      throw e;
    }
    setUser(null);
    setSessionEnded(false);
    voluntary.current = false;
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, sessionEnded, login, register, logout, logoutAll, deleteAccount }),
    [user, isLoading, sessionEnded, login, register, logout, logoutAll, deleteAccount]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
