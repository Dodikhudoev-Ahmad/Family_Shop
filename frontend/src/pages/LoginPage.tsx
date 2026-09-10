import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/Button/Button';
import { ApiError } from '../lib/api';
import './AccountPage.css';

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const PASSWORD_MIN_LENGTH = 8;

function passwordComplexityError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Минимум ${PASSWORD_MIN_LENGTH} символов`;
  if (!/[a-zA-Zа-яА-Я]/.test(password) || !/\d/.test(password)) return 'Нужны буквы и цифры';
  return null;
}

export function LoginPage() {
  const { user, isLoading, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const target = user?.role === 'Admin' ? '/admin/orders' : from ?? '/account';
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const emailError = touched.email && !EMAIL_RE.test(email) ? 'Введите корректный email' : null;
  const passwordError = touched.password ? (tab === 'register' ? passwordComplexityError(password) : password ? null : 'Введите пароль') : null;
  const nameError = tab === 'register' && touched.name && !name.trim() ? 'Укажите имя' : null;

  const isValid = !emailError && !passwordError && !nameError && email && password && (tab === 'login' || name);

  if (!isLoading && user) {
    return <Navigate to={target} replace />;
  }

  const switchTab = (next: 'login' | 'register') => {
    setTab(next);
    setServerError(null);
    setTouched({});
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true, name: true });
    setServerError(null);
    if (!isValid) return;
    setIsSubmitting(true);
    try {
      const loggedInUser = tab === 'login' ? await login(email, password) : await register(email, password, name);
      navigate(loggedInUser.role === 'Admin' ? '/admin/orders' : from ?? '/account', { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Что-то пошло не так. Попробуйте ещё раз.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container account">
      <div className="auth-form">
        <div className="auth-form__tabs">
          <button className={`auth-form__tab ${tab === 'login' ? 'is-active' : ''}`} onClick={() => switchTab('login')}>
            Войти
          </button>
          <button className={`auth-form__tab ${tab === 'register' ? 'is-active' : ''}`} onClick={() => switchTab('register')}>
            Регистрация
          </button>
          <span
            className="auth-form__tab-indicator"
            style={{ transform: tab === 'login' ? 'translateX(0)' : 'translateX(100%)' }}
          />
        </div>

        <form onSubmit={handleSubmit} className="auth-form__form">
          {tab === 'register' && (
            <div className="checkout__field">
              <label htmlFor="name">Имя</label>
              <input
                id="name"
                value={name}
                className={nameError ? 'has-error' : ''}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              />
              {nameError && <span className="checkout__error">{nameError}</span>}
            </div>
          )}

          <div className="checkout__field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              className={emailError ? 'has-error' : ''}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            />
            {emailError && <span className="checkout__error">{emailError}</span>}
          </div>

          <div className="checkout__field">
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              type="password"
              value={password}
              className={passwordError ? 'has-error' : ''}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
            />
            {passwordError && <span className="checkout__error">{passwordError}</span>}
            {tab === 'register' && !passwordError && (
              <span className="auth-form__hint">Минимум {PASSWORD_MIN_LENGTH} символов, буквы и цифры</span>
            )}
          </div>

          {serverError && <span className="checkout__error auth-form__server-error">{serverError}</span>}

          <Button type="submit" variant="primary" size="lg" disabled={isSubmitting}>
            {isSubmitting ? 'Подождите...' : tab === 'login' ? 'Войти' : 'Создать аккаунт'}
          </Button>
        </form>
      </div>
    </div>
  );
}
