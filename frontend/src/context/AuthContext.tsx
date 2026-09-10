import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useToast } from './ToastContext';
import { loginRequest, logoutRequest, registerRequest, silentRefresh, type ApiUserRole } from '../lib/api';
import { onAccessTokenChange, setAccessToken } from '../lib/authToken';

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
    silentRefresh()
      .then((data) => {
        if (cancelled || !data) return;
        setAccessToken(data.accessToken);
        setUser({ id: data.userId, email: data.email, name: data.name, role: data.role });
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
    showToast('Вы успешно вошли в аккаунт');
    return loggedInUser;
  };

  const register = async (email: string, password: string, name: string) => {
    const data = await registerRequest(email, password, name);
    setAccessToken(data.accessToken);
    const registeredUser = { id: data.userId, email: data.email, name: data.name, role: data.role };
    setUser(registeredUser);
    showToast('Аккаунт создан, добро пожаловать!');
    return registeredUser;
  };

  const logout = () => {
    setAccessToken(null);
    setUser(null);
    showToast('Вы вышли из аккаунта', 'info');
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
