/**
 * The one-time token of an e-mail link lives in the URL fragment (`/reset-password#token=...`): a fragment is never sent to a
 * server, so it stays out of access logs and Referer headers. The page reads it once and removes it from the address bar.
 */
export function readTokenFromHash(hash: string): string | null {
  const match = /^#?(?:.*&)?token=([A-Za-z0-9_-]{1,128})(?:&.*)?$/.exec(hash);
  return match ? match[1] : null;
}

export function clearHash(): void {
  try {
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  } catch {
    // history unavailable: the token is harmless once used
  }
}
