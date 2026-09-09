// In-memory access token store, shared between AuthContext (owns the value, drives UI)
// and api.ts (reads it for the Authorization header, writes it after a silent refresh).
// Deliberately not persisted (localStorage/sessionStorage) to avoid XSS token theft.

type Listener = (token: string | null) => void;

let accessToken: string | null = null;
const listeners = new Set<Listener>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  listeners.forEach((listener) => listener(token));
}

export function onAccessTokenChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
