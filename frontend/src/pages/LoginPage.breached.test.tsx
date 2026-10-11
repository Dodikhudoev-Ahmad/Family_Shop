import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as AuthContext from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { LoginPage } from './LoginPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('registration with a password known from data breaches', () => {
  it('shows the translated message chosen by the error code, not the server text', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: null,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn().mockRejectedValue(new ApiError('This password has appeared in a data breach - choose another one.', { status: 400, code: 'breached_password' })),
      logout: vi.fn(),
      reloadSession: vi.fn(),
    });
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Регистрация' }));
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Алия' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.kz' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'Passw0rd1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    expect(await screen.findByText(/встречается в утечках данных/)).toBeInTheDocument();
    expect(screen.queryByText(/appeared in a data breach/)).not.toBeInTheDocument();
  });
});
