import * as Crypto from 'expo-crypto';

export function newIdempotencyKey(): string {
  return Crypto.randomUUID();
}

export interface IdempotencyKeyHolder {
  /** The key for a request with this body signature: the same one while the signature is unchanged, a fresh one after it changed. */
  keyFor: (signature: string) => string;
  /** The order was placed: the next order gets a new key. */
  reset: () => void;
}

/**
 * Idempotency-Key for creating an order. One key stays for the same request: if the answer is lost (network, a double tap,
 * a retry) the server returns the first answer instead of creating a second order. The key changes only when the request
 * body changes (cart, promo, contact or delivery details) - the server refuses a key reused with another body - and after
 * the order was placed. A refused attempt (no stock, unavailable size...) keeps the key: nothing was created under it.
 */
export function createIdempotencyKeyHolder(generate: () => string = newIdempotencyKey): IdempotencyKeyHolder {
  // Generated when checkout opens; the first signature adopts it rather than replacing it.
  let key = generate();
  let signature: string | null = null;
  return {
    keyFor(next) {
      if (signature !== null && signature !== next) key = generate();
      signature = next;
      return key;
    },
    reset() {
      key = generate();
      signature = null;
    },
  };
}
