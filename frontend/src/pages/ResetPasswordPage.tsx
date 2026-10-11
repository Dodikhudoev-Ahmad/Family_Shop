import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/Button/Button';
import { ApiError, resetPasswordRequest } from '../lib/api';
import { setAccessToken } from '../lib/authToken';
import { useNoindexSeo } from '../hooks/useNoindexSeo';
import { clearHash, readTokenFromHash } from '../utils/emailLinkToken';
import { passwordComplexityError } from '../utils/passwordRules';
import './AccountPage.css';

/** Opened from the e-mail link: `/reset-password#token=...`. Sets the new password; the server ends every session. */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  useNoindexSeo('resetPasswordTitle');
  const location = useLocation();
  // Read once, then removed from the address bar (the token is a secret until used).
  const [token] = useState(() => readTokenFromHash(location.hash));
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [touched, setTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [linkInvalid, setLinkInvalid] = useState(token === null);

  useEffect(() => {
    clearHash();
  }, []);

  const passwordError = touched ? passwordComplexityError(password) : null;
  const repeatError = touched && !passwordError && repeat !== password ? t('resetPassword.mismatch') : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setServerError(null);
    if (!token || passwordComplexityError(password) || repeat !== password) return;
    setIsSubmitting(true);
    try {
      await resetPasswordRequest(token, password);
      // Every session of the account is over on the server; forget the token this browser holds too.
      setAccessToken(null);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'invalid_token') setLinkInvalid(true);
      else if (err instanceof ApiError && err.code === 'password_is_email') setServerError(t('auth.passwordIsEmail'));
      else if (err instanceof ApiError && err.code === 'breached_password') setServerError(t('auth.passwordBreached'));
      else setServerError(err instanceof ApiError ? err.message : t('auth.generic'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container account">
      <div className="auth-form">
        <h1 className="auth-form__title">{t('resetPassword.title')}</h1>
        {done ? (
          <div className="auth-form__form">
            <p className="auth-form__notice" role="status">
              {t('resetPassword.success')}
            </p>
            <Link to="/login" className="btn btn--primary btn--lg auth-form__cta">
              {t('resetPassword.toLogin')}
            </Link>
          </div>
        ) : linkInvalid ? (
          <div className="auth-form__form">
            <p className="auth-form__notice auth-form__notice--error" role="alert">
              {t('resetPassword.invalidLink')}
            </p>
            <Link to="/forgot-password" className="btn btn--primary btn--lg auth-form__cta">
              {t('resetPassword.requestNew')}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form__form" noValidate>
            <p className="auth-form__text">{t('resetPassword.intro')}</p>
            <div className="checkout__field">
              <label htmlFor="new-password">{t('resetPassword.newPassword')}</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                className={passwordError ? 'has-error' : ''}
                onChange={(e) => setPassword(e.target.value)}
              />
              {passwordError && <span className="checkout__error">{passwordError}</span>}
            </div>
            <div className="checkout__field">
              <label htmlFor="repeat-password">{t('resetPassword.repeatPassword')}</label>
              <input
                id="repeat-password"
                type="password"
                autoComplete="new-password"
                value={repeat}
                className={repeatError ? 'has-error' : ''}
                onChange={(e) => setRepeat(e.target.value)}
              />
              {repeatError && <span className="checkout__error">{repeatError}</span>}
            </div>
            {serverError && <span className="checkout__error auth-form__server-error">{serverError}</span>}
            <Button type="submit" variant="primary" size="lg" disabled={isSubmitting}>
              {isSubmitting ? t('auth.wait') : t('resetPassword.submit')}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
