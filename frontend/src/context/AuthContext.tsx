import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useToast } from './ToastContext';
import { loginRequest, logoutRequest, registerRequest, silentRefresh, type ApiUserRole } from '../lib/api';
import { hasSessionHint, onAccessTokenChange, setAccessToken } from '../lib/authToken';
import i18n from '../i18n';

interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: ApiUserRole;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** True while restoring a session from the refresh cookie on first load. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (email: string, password: string, name: string) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();

  // If the token gets cleared elsewhere (api.ts's interceptor, after a failed refresh),
  // reflect that in the UI too.
  useEffect(
    () =>
      onAccessTokenChange((token) => {
        if (!token) setUser(null);
      }),
    []
  );

  useEffect(() => {
    let cancelled = false;
    if (!hasSessionHint()) {
      setIsLoading(false);
      return;
    }
    silentRefresh()
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setAccessToken(null); // stale hint - the refresh cookie is gone/expired
          return;
        }
        setAccessToken(data.accessToken);
        setUser({ id: data.userId, email: data.email, name: data.name, role: data.role });
      })
      .catch(() => {
        // network error: stay logged out instead of leaving an unhandled rejection
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string) => {
    const data = await loginRequest(email, password);
    setAccessToken(data.accessToken);
    const loggedInUser = { id: data.userId, email: data.email, name: data.name, role: data.role };
    setUser(loggedInUser);
    showToast(i18n.t('auth.loggedIn'));
    return loggedInUser;
  };

  const register = async (email: string, password: string, name: string) => {
    const data = await registerRequest(email, password, name);
    setAccessToken(data.accessToken);
    const registeredUser = { id: data.userId, email: data.email, name: data.name, role: data.role };
    setUser(registeredUser);
    showToast(i18n.t('auth.registered'));
    return registeredUser;
  };

  const logout = () => {
    setAccessToken(null);
    setUser(null);
    showToast(i18n.t('auth.loggedOut'), 'info');
    void logoutRequest();
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
