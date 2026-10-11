import i18n from '../i18n';

export const PASSWORD_MIN_LENGTH = 8;

/** Client-side mirror of the server's password rules (length, letters and digits); null means acceptable. */
export function passwordComplexityError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return i18n.t('auth.passwordMin', { n: PASSWORD_MIN_LENGTH });
  // \p{L}: any letter, so Kazakh-only passwords (ә, қ, ү...) count as having letters too.
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return i18n.t('auth.passwordComplexity');
  return null;
}
