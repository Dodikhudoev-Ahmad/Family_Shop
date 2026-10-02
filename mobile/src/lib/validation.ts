/**
 * Client-side form rules, mirroring the server (backend/Application/Validators) so a mistake is caught
 * before a round trip. The server stays the authority: its answers are shown whenever it disagrees.
 * Each rule returns a translation key (never text) so the screen decides the language.
 */

export interface FieldError {
  key: string;
  params?: Record<string, string | number>;
}

const err = (key: string, params?: Record<string, string | number>): FieldError => ({ key, params });

// ---- limits (same numbers as the validators / DTOs on the server) ----
export const LIMITS = {
  email: 256,
  name: 100,
  passwordMin: 8,
  passwordMaxBytes: 72,
  loginPasswordMax: 1024,
  phone: 32,
  address: 300,
  promoCode: 50,
  orderLines: 50,
  lineQuantity: 50,
  size: 20,
  review: 2000,
} as const;

/** UTF-8 length without TextEncoder (not guaranteed on every JS engine): bcrypt cuts at 72 BYTES, not characters. */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

// ---- auth ----

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export function validateEmail(email: string): FieldError | null {
  const value = email.trim();
  if (!EMAIL_RE.test(value)) return err('auth.emailInvalid');
  if (value.length > LIMITS.email) return err('mobile.tooLong', { n: LIMITS.email });
  return null;
}

export function validateName(name: string): FieldError | null {
  const value = name.trim();
  if (!value) return err('auth.nameRequired');
  if (value.length > LIMITS.name) return err('mobile.tooLong', { n: LIMITS.name });
  return null;
}

/** Same list as PasswordRules.Common on the server (case-insensitive, trimmed). */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd', 'p@ssw0rd', 'p@ssword1',
  '12345678', '123456789', '1234567890', '12345678910', 'qwerty123', 'qwerty1234', 'qwerty12345', 'qwertyuiop',
  '1q2w3e4r', '1q2w3e4r5t', '1qaz2wsx', 'zaq12wsx', 'qazwsx123', 'abc12345', 'abcd1234', 'admin123', 'admin1234',
  'welcome1', 'welcome123', 'letmein123', 'iloveyou1', 'iloveyou123', 'monkey123', 'dragon123', 'sunshine1',
  'princess1', 'football1', 'baseball1', 'master123', 'superman1', 'trustno1', 'changeme1', 'changeme123',
  'kazakhstan1', 'almaty123', 'astana123', 'familyshop1', 'familyshop123', 'qwe12345', 'asdf1234', 'zxcvbnm123',
]);

/** Registration password: letters + digits, 8..72 bytes, not a common one, not the e-mail address. */
export function validateNewPassword(password: string, email: string): FieldError | null {
  if (!password) return err('auth.passwordRequired');
  if (password.length < LIMITS.passwordMin) return err('auth.passwordMin', { n: LIMITS.passwordMin });
  if (utf8ByteLength(password) > LIMITS.passwordMaxBytes) return err('mobile.passwordTooLong', { n: LIMITS.passwordMaxBytes });
  // \p{L} matches every Unicode letter, so Kazakh-only passwords (ә, қ, ү...) count as having letters too.
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return err('auth.passwordComplexity');
  if (COMMON_PASSWORDS.has(password.trim().toLowerCase())) return err('mobile.passwordTooCommon');
  if (email.trim() && password.toLowerCase() === email.trim().toLowerCase()) return err('mobile.passwordSameAsEmail');
  return null;
}

/** Login accepts whatever the account already has: only "not empty" and the upper bound. */
export function validateLoginPassword(password: string): FieldError | null {
  if (!password) return err('auth.passwordRequired');
  if (password.length > LIMITS.loginPasswordMax) return err('mobile.tooLong', { n: LIMITS.loginPasswordMax });
  return null;
}

// ---- checkout ----

const NATIONAL_PHONE_LENGTH = 10; // digits after the +7 country code

/** The 10-digit national number. A displayed "+7 (" prefix is stripped as text first so its "7" is not
 * re-counted on every keystroke; a pasted 11-digit number with a leading 7/8 trunk code loses that digit. */
export function getNationalDigits(raw: string): string {
  const withoutPrefix = raw.startsWith('+7') ? raw.slice(2) : raw;
  let digits = withoutPrefix.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) digits = digits.slice(1);
  return digits.slice(0, NATIONAL_PHONE_LENGTH);
}

export function formatPhoneInput(raw: string): string {
  const national = getNationalDigits(raw);
  if (!national) return '';
  let result = `+7 (${national.slice(0, 3)}`;
  if (national.length >= 3) result += ')';
  if (national.length > 3) result += ` ${national.slice(3, 6)}`;
  if (national.length > 6) result += `-${national.slice(6, 8)}`;
  if (national.length > 8) result += `-${national.slice(8, 10)}`;
  return result;
}

export function validatePhone(value: string): FieldError | null {
  const national = getNationalDigits(value);
  if (!national) return err('checkout.phoneRequired');
  if (national.length < NATIONAL_PHONE_LENGTH) return err('checkout.phoneIncomplete');
  return null;
}

export function validateAddress(value: string, required: boolean): FieldError | null {
  const trimmed = value.trim();
  if (required && !trimmed) return err('checkout.addressRequired');
  if (trimmed.length > LIMITS.address) return err('mobile.tooLong', { n: LIMITS.address });
  return null;
}

export function validatePromoCodeInput(value: string): FieldError | null {
  return value.trim().length > LIMITS.promoCode ? err('mobile.tooLong', { n: LIMITS.promoCode }) : null;
}

export interface OrderLineInput {
  productId: string;
  quantity: number;
  size: string | null;
}

/** What the server will refuse in an order body: empty, > 50 lines, quantity outside 1..50, size > 20, bad id. */
export function validateOrderLines(lines: OrderLineInput[]): FieldError | null {
  if (lines.length === 0) return err('checkout.empty');
  if (lines.length > LIMITS.orderLines) return err('mobile.cartTooManyLines', { n: LIMITS.orderLines });
  for (const line of lines) {
    if (!Number.isInteger(Number(line.productId)) || Number(line.productId) <= 0) return err('checkout.failed');
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > LIMITS.lineQuantity) {
      return err('mobile.cartMaxQty', { n: LIMITS.lineQuantity });
    }
    if (line.size !== null && line.size.length > LIMITS.size) return err('checkout.failed');
  }
  return null;
}

// ---- reviews ----

/** A review needs a rating of 1..5 and a non-empty text of at most 2000 characters (CreateReviewRequestValidator). */
export function validateReview(rating: number, comment: string): FieldError | null {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return err('reviews.chooseRating');
  const text = comment.trim();
  if (!text) return err('reviews.writeText');
  if (text.length > LIMITS.review) return err('mobile.tooLong', { n: LIMITS.review });
  return null;
}

// ---- server messages ----

export type AuthMode = 'login' | 'register';

/**
 * Turns a failed auth request into text for the form. Known server messages are translated; a failed
 * login is always "wrong email or password", and a failed registration never confirms that an e-mail is
 * already taken - the server's "already exists" is replaced with a neutral message. Anything else
 * (network, rate limit, other validation text) is shown as the server/client produced it.
 */
export function authErrorKey(mode: AuthMode, message: string): { key: string } | { raw: string } {
  const text = message.toLowerCase();
  if (mode === 'login' && text.includes('invalid email or password')) return { key: 'mobile.invalidCredentials' };
  if (mode === 'register') {
    if (text.includes('already exists')) return { key: 'mobile.registerFailed' };
    if (text.includes('too common')) return { key: 'mobile.passwordTooCommon' };
    if (text.includes('same as the e-mail')) return { key: 'mobile.passwordSameAsEmail' };
    if (text.includes('letters and digits')) return { key: 'auth.passwordComplexity' };
  }
  return { raw: message };
}
