import {
  authErrorKey,
  formatPhoneInput,
  getNationalDigits,
  LIMITS,
  utf8ByteLength,
  validateAddress,
  validateEmail,
  validateLoginPassword,
  validateName,
  validateNewPassword,
  validateOrderLines,
  validatePhone,
} from '../src/lib/validation';

const key = (e: ReturnType<typeof validateEmail>) => e?.key ?? null;

describe('registration password (mirrors PasswordRules on the server)', () => {
  it('accepts letters + digits, 8+ characters', () => {
    expect(validateNewPassword('Zebra2026x', 'a@b.kz')).toBeNull();
  });
  it('requires at least 8 characters, letters AND digits', () => {
    expect(key(validateNewPassword('', 'a@b.kz'))).toBe('auth.passwordRequired');
    expect(key(validateNewPassword('abc12', 'a@b.kz'))).toBe('auth.passwordMin');
    expect(key(validateNewPassword('abcdefghij', 'a@b.kz'))).toBe('auth.passwordComplexity');
    expect(key(validateNewPassword('1234567890', 'a@b.kz'))).toBe('auth.passwordComplexity');
  });
  it('counts Kazakh-only letters as letters', () => {
    expect(validateNewPassword('әқүңөұ12345', 'a@b.kz')).toBeNull();
  });
  it('limits the password to 72 BYTES, not characters (bcrypt truncates silently)', () => {
    expect(validateNewPassword('a1'.repeat(36), 'a@b.kz')).toBeNull(); // 72 bytes
    expect(key(validateNewPassword('a1'.repeat(36) + 'x', 'a@b.kz'))).toBe('mobile.passwordTooLong');
    const cyrillic = 'ж1' + 'я'.repeat(35); // 37 characters but 2+... bytes: over 72
    expect(utf8ByteLength(cyrillic)).toBeGreaterThan(72);
    expect(cyrillic.length).toBeLessThan(72);
    expect(key(validateNewPassword(cyrillic, 'a@b.kz'))).toBe('mobile.passwordTooLong');
  });
  it('refuses common passwords (any case) and the e-mail address itself', () => {
    expect(key(validateNewPassword('Password123', 'a@b.kz'))).toBe('mobile.passwordTooCommon');
    expect(key(validateNewPassword('FAMILYSHOP123', 'a@b.kz'))).toBe('mobile.passwordTooCommon');
    expect(key(validateNewPassword('me2026@mail.kz', 'ME2026@mail.kz'))).toBe('mobile.passwordSameAsEmail');
  });
  it('byte length handles multi-byte and astral characters', () => {
    expect([utf8ByteLength('a'), utf8ByteLength('я'), utf8ByteLength('€'), utf8ByteLength('😀')]).toEqual([1, 2, 3, 4]);
  });
});

describe('login / email / name', () => {
  it('login password: only "not empty" and an upper bound - no complexity rules', () => {
    expect(validateLoginPassword('x')).toBeNull();
    expect(key(validateLoginPassword(''))).toBe('auth.passwordRequired');
    expect(validateLoginPassword('x'.repeat(LIMITS.loginPasswordMax + 1))).not.toBeNull();
  });
  it('email shape and length', () => {
    expect(validateEmail(' anna@mail.kz ')).toBeNull();
    expect(key(validateEmail('anna@'))).toBe('auth.emailInvalid');
    expect(key(validateEmail('a b@mail.kz'))).toBe('auth.emailInvalid');
    expect(validateEmail('a'.repeat(252) + '@b.kz')).not.toBeNull();
  });
  it('name required, at most 100', () => {
    expect(key(validateName('  '))).toBe('auth.nameRequired');
    expect(validateName('Анна')).toBeNull();
    expect(validateName('я'.repeat(101))).not.toBeNull();
  });
});

describe('phone', () => {
  it('formats as +7 (XXX) XXX-XX-XX while typing', () => {
    expect(formatPhoneInput('7')).toBe('+7 (7');
    expect(formatPhoneInput('7051234567')).toBe('+7 (705) 123-45-67');
  });
  it('does not re-count the +7 prefix, and strips a pasted leading 8 / 7', () => {
    expect(getNationalDigits('+7 (705) 123')).toBe('705123');
    expect(getNationalDigits('87051234567')).toBe('7051234567');
    expect(getNationalDigits('+77051234567')).toBe('7051234567');
  });
  it('is required and must be complete', () => {
    expect(key(validatePhone(''))).toBe('checkout.phoneRequired');
    expect(key(validatePhone('+7 (705) 12'))).toBe('checkout.phoneIncomplete');
    expect(validatePhone('+7 (705) 123-45-67')).toBeNull();
  });
});

describe('address and order lines', () => {
  it('address is required for courier only, and at most 300 characters', () => {
    expect(key(validateAddress(' ', true))).toBe('checkout.addressRequired');
    expect(validateAddress('', false)).toBeNull();
    expect(validateAddress('x'.repeat(301), true)).not.toBeNull();
    expect(validateAddress('x'.repeat(300), true)).toBeNull();
  });

  const line = (n: number, quantity = 1, size: string | null = null) => ({ productId: String(n), quantity, size });
  it('refuses an empty order, more than 50 lines, and quantities outside 1..50', () => {
    expect(key(validateOrderLines([]))).toBe('checkout.empty');
    expect(validateOrderLines(Array.from({ length: 50 }, (_, i) => line(i + 1)))).toBeNull();
    expect(key(validateOrderLines(Array.from({ length: 51 }, (_, i) => line(i + 1))))).toBe('mobile.cartTooManyLines');
    expect(key(validateOrderLines([line(1, 51)]))).toBe('mobile.cartMaxQty');
    expect(key(validateOrderLines([line(1, 0)]))).toBe('mobile.cartMaxQty');
    expect(validateOrderLines([line(1, 50, 'XL')])).toBeNull();
  });
  it('refuses a malformed product id or an over-long size', () => {
    expect(validateOrderLines([{ productId: 'abc', quantity: 1, size: null }])).not.toBeNull();
    expect(validateOrderLines([line(1, 1, 'x'.repeat(21))])).not.toBeNull();
  });
});

describe('what a failed auth request shows', () => {
  it('a failed login is only ever "wrong email or password"', () => {
    expect(authErrorKey('login', 'Invalid email or password.')).toEqual({ key: 'mobile.invalidCredentials' });
  });
  it('a failed registration never confirms that the e-mail is taken', () => {
    expect(authErrorKey('register', 'A user with this email already exists.')).toEqual({ key: 'mobile.registerFailed' });
  });
  it('translates known password messages and passes anything else through untouched', () => {
    expect(authErrorKey('register', 'This password is too common - choose another one.')).toEqual({ key: 'mobile.passwordTooCommon' });
    expect(authErrorKey('register', 'Password must not be the same as the e-mail address.')).toEqual({ key: 'mobile.passwordSameAsEmail' });
    expect(authErrorKey('login', 'Слишком много попыток. Попробуйте снова через минуту.')).toEqual({ raw: 'Слишком много попыток. Попробуйте снова через минуту.' });
  });
});
