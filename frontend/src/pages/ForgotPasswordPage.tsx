import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/Button/Button';
import { ApiError, forgotPasswordRequest } from '../lib/api';
import { useNoindexSeo } from '../hooks/useNoindexSeo';
import './AccountPage.css';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

/** "Forgot password": asks for the address and always shows the same confirmation - the page never says whether it exists. */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  useNoindexSeo('forgotPasswordTitle');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const emailError = touched && !EMAIL_RE.test(email.trim()) ? t('auth.emailInvalid') : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setServerError(null);
    if (!EMAIL_RE.test(email.trim())) return;
    setIsSubmitting(true);
    try {
      await forgotPasswordRequest(email.trim());
      setSent(true);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('auth.generic'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container account">
      <div className="auth-form">
        <h1 className="auth-form__title">{t('forgotPassword.title')}</h1>
        {sent ? (
          <div className="auth-form__form">
            <p className="auth-form__notice" role="status">
              {t('forgotPassword.sent')}
            </p>
            <Link to="/login" className="auth-form__link">
              {t('forgotPassword.back')}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form__form" noValidate>
            <p className="auth-form__text">{t('forgotPassword.intro')}</p>
            <div className="checkout__field">
              <label htmlFor="forgot-email">Email</label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                className={emailError ? 'has-error' : ''}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched(true)}
              />
              {emailError && <span className="checkout__error">{emailError}</span>}
            </div>
            {serverError && <span className="checkout__error auth-form__server-error">{serverError}</span>}
            <Button type="submit" variant="primary" size="lg" disabled={isSubmitting}>
              {isSubmitting ? t('auth.wait') : t('forgotPassword.submit')}
            </Button>
            <Link to="/login" className="auth-form__link">
              {t('forgotPassword.back')}
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
