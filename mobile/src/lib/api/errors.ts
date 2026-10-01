/**
 * An API failure. `message` is safe to show to the user: it is either the server's validation text or a
 * translated generic one. It never contains tokens, passwords or request bodies.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}
