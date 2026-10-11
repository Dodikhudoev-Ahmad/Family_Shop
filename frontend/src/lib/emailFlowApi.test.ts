import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import {
  ApiError,
  confirmEmailRequest,
  forgotPasswordRequest,
  registerRequest,
  resendConfirmationRequest,
  resetPasswordRequest,
} from './api';

const ok = () => new Response(JSON.stringify({ success: true, data: true, errors: [] }), { status: 200 });

describe('e-mail confirmation and password reset calls', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await i18n.changeLanguage('ru');
  });

  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return { url: String(url), body: JSON.parse(String(init.body)) as Record<string, unknown>, init };
  };

  it('forgot password posts the address and the site language', async () => {
    await i18n.changeLanguage('kk');
    await forgotPasswordRequest('a@b.kz');

    const { url, body, init } = lastCall();
    expect(url).toMatch(/\/auth\/password\/forgot$/);
    expect(init.method).toBe('POST');
    expect(body).toEqual({ email: 'a@b.kz', locale: 'kk' });
  });

  it('resend posts the address and the site language', async () => {
    await i18n.changeLanguage('en');
    await resendConfirmationRequest('a@b.kz');

    expect(lastCall().url).toMatch(/\/auth\/email\/resend$/);
    expect(lastCall().body).toEqual({ email: 'a@b.kz', locale: 'en' });
  });

  it('confirm and reset post only the token (and the new password)', async () => {
    await confirmEmailRequest('tok-1');
    expect(lastCall().url).toMatch(/\/auth\/email\/confirm$/);
    expect(lastCall().body).toEqual({ token: 'tok-1' });

    await resetPasswordRequest('tok-2', 'Brand-new-pw1');
    expect(lastCall().url).toMatch(/\/auth\/password\/reset$/);
    expect(lastCall().body).toEqual({ token: 'tok-2', newPassword: 'Brand-new-pw1' });
  });

  it('registration tells the server which language the confirmation letter should be in', async () => {
    fetchMock.mockImplementation(async () =>
      new Response(
        JSON.stringify({ success: true, data: { userId: 1, email: 'a@b.kz', name: 'A', role: 'Customer', accessToken: 'x', emailConfirmed: false }, errors: [] }),
        { status: 200 },
      ),
    );

    await registerRequest('a@b.kz', 'Tr1ckyTestValue', 'A');

    expect(lastCall().body.locale).toBe('ru');
  });

  it('a 401 is not turned into a refresh-retry (the visitor has no session)', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ success: false, errors: ['x'], code: 'invalid_token' }), { status: 400 }));

    await expect(resetPasswordRequest('tok', 'Brand-new-pw1')).rejects.toMatchObject({ code: 'invalid_token' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await resetPasswordRequest('tok', 'x').catch((e: unknown) => e)).toBeInstanceOf(ApiError);
  });
});
