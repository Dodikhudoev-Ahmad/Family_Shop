// In-memory access token store, shared between AuthContext (owns the value, drives UI)
// and api.ts (reads it for the Authorization header, writes it after a silent refresh).
// Deliberately not persisted (localStorage/sessionStorage) to avoid XSS token theft.

type Listener = (token: string | null) => void;

let accessToken: string | null = null;
const listeners = new Set<Listener>();

export function getAccessToken(): string | null {
  return accessToken;
}

// Non-secret hint (just "1") that this browser has signed in before. The refresh cookie is
// httpOnly, so JS can't tell whether one exists; without the hint every anonymous page load
// fires a pointless /auth/refresh that 401s (red console error + burns the rate-limit budget).
const SESSION_HINT_KEY = 'fs-has-session';

export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === '1';
  } catch {
    return true;
  }
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  try {
    if (token) localStorage.setItem(SESSION_HINT_KEY, '1');
    else localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // storage unavailable - the hint is only an optimisation
  }
  listeners.forEach((listener) => listener(token));
}

export function onAccessTokenChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
