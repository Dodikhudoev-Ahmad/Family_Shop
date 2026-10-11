import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, resendConfirmationRequest } from '../../lib/api';
import './EmailConfirmBanner.css';

interface Props {
  email: string;
}

/** A soft reminder to confirm the address. It blocks nothing: orders work without confirmation. */
export function EmailConfirmBanner({ email }: Props) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const resend = async () => {
    setStatus('sending');
    setError(null);
    try {
      await resendConfirmationRequest(email);
      setStatus('sent');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.generic'));
      setStatus('error');
    }
  };

  return (
    <div className="email-banner" role="status">
      <p className="email-banner__text">{t('emailBanner.text', { email })}</p>
      {status === 'sent' ? (
        <p className="email-banner__sent">{t('emailBanner.sent')}</p>
      ) : (
        <button type="button" className="email-banner__button" onClick={resend} disabled={status === 'sending'}>
          {status === 'sending' ? t('emailBanner.sending') : t('emailBanner.resend')}
        </button>
      )}
      {error && <p className="email-banner__error">{error}</p>}
    </div>
  );
}
