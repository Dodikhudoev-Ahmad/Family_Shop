/**
 * An API failure. `message` is safe to show to the user: it is either the server's validation text or a
 * translated generic one. It never contains tokens, passwords or request bodies.
 */
export class ApiError extends Error {
  readonly status: number;
  /** Machine-readable failure kind from the API envelope ('out_of_stock', 'conflict', ...). */
  readonly code?: string;
  readonly meta?: Record<string, unknown>;

  constructor(status: number, message: string, details: { code?: string; meta?: Record<string, unknown> } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = details.code;
    this.meta = details.meta;
  }
}
