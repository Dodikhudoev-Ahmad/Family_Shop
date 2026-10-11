import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as AuthContext from '../context/AuthContext';
import * as api from '../lib/api';
import { setAccessToken } from '../lib/authToken';
import { EmailConfirmBanner } from '../components/EmailConfirmBanner/EmailConfirmBanner';
import { ConfirmEmailPage } from './ConfirmEmailPage';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { ResetPasswordPage } from './ResetPasswordPage';

const reloadSession = vi.fn();

function mockAuth(user: { id: number; email: string; name: string; role: 'Customer' | 'Admin'; emailConfirmed: boolean } | null = null) {
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
    user,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    reloadSession,
  });
}

function renderAt(path: string, ui: React.ReactElement, route: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={ui} />
        <Route path="*" element={<div>elsewhere</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  reloadSession.mockReset();
  mockAuth();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.head.innerHTML = '';
});

describe('ForgotPasswordPage', () => {
  it('shows the same neutral confirmation after the request', async () => {
    const forgot = vi.spyOn(api, 'forgotPasswordRequest').mockResolvedValue(true);
    renderAt('/forgot-password', <ForgotPasswordPage />, '/forgot-password');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nobody@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить ссылку' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Если такой адрес зарегистрирован');
    expect(forgot).toHaveBeenCalledWith('nobody@example.com');
  });

  it('does not call the server for a malformed address', async () => {
    const forgot = vi.spyOn(api, 'forgotPasswordRequest').mockResolvedValue(true);
    renderAt('/forgot-password', <ForgotPasswordPage />, '/forgot-password');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить ссылку' }));

    expect(await screen.findByText('Введите корректный email')).toBeInTheDocument();
    expect(forgot).not.toHaveBeenCalled();
  });

  it('is a closed page', () => {
    renderAt('/forgot-password', <ForgotPasswordPage />, '/forgot-password');
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,nofollow');
  });
});

describe('ResetPasswordPage', () => {
  const fill = (password: string, repeat = password) => {
    fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: password } });
    fireEvent.change(screen.getByLabelText('Повторите пароль'), { target: { value: repeat } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить пароль' }));
  };

  it('takes the token from the fragment, sends it with the new password and forgets the local token', async () => {
    const reset = vi.spyOn(api, 'resetPasswordRequest').mockResolvedValue(true);
    setAccessToken('stale-access');
    renderAt('/reset-password#token=Abc_123-xyz', <ResetPasswordPage />, '/reset-password');

    fill('Brand-new-pw1');

    expect(await screen.findByText(/Пароль изменён/)).toBeInTheDocument();
    expect(reset).toHaveBeenCalledWith('Abc_123-xyz', 'Brand-new-pw1');
    expect((await import('../lib/authToken')).getAccessToken()).toBeNull();
  });

  it('refuses mismatching and weak passwords without calling the server', async () => {
    const reset = vi.spyOn(api, 'resetPasswordRequest').mockResolvedValue(true);
    renderAt('/reset-password#token=Abc', <ResetPasswordPage />, '/reset-password');

    fill('Brand-new-pw1', 'Another-pw-2');
    expect(await screen.findByText('Пароли не совпадают')).toBeInTheDocument();

    fill('short');
    expect(await screen.findByText(/Минимум 8 символов/)).toBeInTheDocument();
    expect(reset).not.toHaveBeenCalled();
  });

  it('shows the "link is invalid" state at once when there is no token', () => {
    renderAt('/reset-password', <ResetPasswordPage />, '/reset-password');

    expect(screen.getByRole('alert')).toHaveTextContent('Ссылка недействительна');
    expect(screen.getByRole('link', { name: 'Запросить новое письмо' })).toHaveAttribute('href', '/forgot-password');
  });

  it('turns an invalid_token answer into the same state, and a breached password into a message', async () => {
    const reset = vi
      .spyOn(api, 'resetPasswordRequest')
      .mockRejectedValueOnce(new api.ApiError('x', { status: 400, code: 'breached_password' }))
      .mockRejectedValueOnce(new api.ApiError('x', { status: 400, code: 'invalid_token' }));
    renderAt('/reset-password#token=Abc', <ResetPasswordPage />, '/reset-password');

    fill('Password1x');
    expect(await screen.findByText(/встречается в утечках данных/)).toBeInTheDocument();

    fill('Brand-new-pw1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Ссылка недействительна');
    expect(reset).toHaveBeenCalledTimes(2);
  });

  it('removes the token from the address bar', async () => {
    window.history.replaceState(null, '', '/reset-password#token=Abc_123');
    vi.spyOn(api, 'resetPasswordRequest').mockResolvedValue(true);
    renderAt('/reset-password#token=Abc_123', <ResetPasswordPage />, '/reset-password');

    await waitFor(() => expect(window.location.hash).toBe(''));
  });
});

describe('ConfirmEmailPage', () => {
  it('confirms once with the token from the fragment', async () => {
    const confirm = vi.spyOn(api, 'confirmEmailRequest').mockResolvedValue(true);
    renderAt('/confirm-email#token=Abc_123', <ConfirmEmailPage />, '/confirm-email');

    expect(await screen.findByText('Email подтверждён. Спасибо!')).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith('Abc_123');
    expect(reloadSession).toHaveBeenCalled();
  });

  it('shows the failure for a refused token', async () => {
    vi.spyOn(api, 'confirmEmailRequest').mockRejectedValue(new api.ApiError('x', { status: 400, code: 'invalid_token' }));
    renderAt('/confirm-email#token=Abc', <ConfirmEmailPage />, '/confirm-email');

    expect(await screen.findByRole('alert')).toHaveTextContent('Ссылка недействительна');
    expect(reloadSession).not.toHaveBeenCalled();
  });

  it('does not call the server without a token', () => {
    const confirm = vi.spyOn(api, 'confirmEmailRequest').mockResolvedValue(true);
    renderAt('/confirm-email', <ConfirmEmailPage />, '/confirm-email');

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('EmailConfirmBanner', () => {
  it('names the address and sends the letter again on request', async () => {
    const resend = vi.spyOn(api, 'resendConfirmationRequest').mockResolvedValue(true);
    render(<EmailConfirmBanner email="alice@example.com" />);

    expect(screen.getByText(/alice@example.com/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Отправить ещё раз' }));

    expect(await screen.findByText(/Письмо отправлено/)).toBeInTheDocument();
    expect(resend).toHaveBeenCalledWith('alice@example.com');
  });

  it('shows an error and keeps the button when sending fails', async () => {
    vi.spyOn(api, 'resendConfirmationRequest').mockRejectedValue(new api.ApiError('Слишком много запросов'));
    render(<EmailConfirmBanner email="alice@example.com" />);

    fireEvent.click(screen.getByRole('button', { name: 'Отправить ещё раз' }));

    expect(await screen.findByText('Слишком много запросов')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отправить ещё раз' })).toBeEnabled();
  });
});
