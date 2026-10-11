import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { confirmEmailRequest } from '../lib/api';
import { useNoindexSeo } from '../hooks/useNoindexSeo';
import { clearHash, readTokenFromHash } from '../utils/emailLinkToken';
import './AccountPage.css';

type State = 'checking' | 'confirmed' | 'invalid';

/** Opened from the e-mail link: `/confirm-email#token=...`. Confirms once on load (a POST: merely opening the link in a
 *  mail scanner would not use it up). */
export function ConfirmEmailPage() {
  const { t } = useTranslation();
  useNoindexSeo('confirmEmailTitle');
  const location = useLocation();
  const { user, reloadSession } = useAuth();
  const [token] = useState(() => readTokenFromHash(location.hash));
  const [state, setState] = useState<State>(token ? 'checking' : 'invalid');
  const started = useRef(false);

  useEffect(() => {
    clearHash();
    if (!token || started.current) return;
    started.current = true;
    confirmEmailRequest(token)
      .then(() => {
        setState('confirmed');
        // If this browser is signed in (possibly as that very user), pick up the new "confirmed" state.
        void reloadSession();
      })
      .catch(() => setState('invalid'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container account">
      <div className="auth-form">
        <h1 className="auth-form__title">{t('confirmEmail.title')}</h1>
        <div className="auth-form__form">
          {state === 'checking' && (
            <p className="auth-form__notice" role="status">
              {t('confirmEmail.checking')}
            </p>
          )}
          {state === 'confirmed' && (
            <>
              <p className="auth-form__notice" role="status">
                {t('confirmEmail.success')}
              </p>
              <Link to={user ? '/account' : '/login'} className="btn btn--primary btn--lg auth-form__cta">
                {user ? t('confirmEmail.toAccount') : t('confirmEmail.toLogin')}
              </Link>
            </>
          )}
          {state === 'invalid' && (
            <>
              <p className="auth-form__notice auth-form__notice--error" role="alert">
                {t('confirmEmail.failure')}
              </p>
              <Link to={user ? '/account' : '/login'} className="btn btn--primary btn--lg auth-form__cta">
                {user ? t('confirmEmail.toAccount') : t('confirmEmail.toLogin')}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
