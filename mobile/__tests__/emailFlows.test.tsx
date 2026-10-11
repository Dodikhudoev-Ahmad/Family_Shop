import { act, create } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EmailConfirmBanner } from '../src/components/EmailConfirmBanner';
import { ForgotPasswordFlow } from '../src/components/ForgotPasswordFlow';
import { ThemeProvider } from '../src/theme/ThemeContext';
import { requestPasswordReset, resendEmailConfirmation } from '../src/lib/api/endpoints';
import { authErrorKey } from '../src/lib/validation';
import ru from '../src/i18n/locales/ru.json';
import kk from '../src/i18n/locales/kk.json';
import en from '../src/i18n/locales/en.json';

const mockRequest = jest.fn();
const mockReloadUser = jest.fn();

jest.mock('../src/lib/api/client', () => ({ api: { request: (...args: unknown[]) => mockRequest(...args) } }));
jest.mock('../src/state/AuthContext', () => ({ useAuth: () => ({ reloadUser: mockReloadUser }) }));

beforeEach(() => {
  mockRequest.mockReset();
  mockReloadUser.mockReset();
  mockRequest.mockResolvedValue(true);
  mockReloadUser.mockResolvedValue(undefined);
});

const textOf = (renderer: ReturnType<typeof create>) => JSON.stringify(renderer.toJSON());

function pressByLabel(renderer: ReturnType<typeof create>, label: string) {
  const target = renderer.root.find((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  target.props.onPress();
}

describe('the two anonymous calls', () => {
  it('forgot password posts the address and language to the shared endpoint, with no credentials', async () => {
    await requestPasswordReset('a@b.kz', 'kk');

    expect(mockRequest).toHaveBeenCalledWith('/auth/password/forgot', { method: 'POST', body: { email: 'a@b.kz', locale: 'kk' } });
  });

  it('resend posts the address and language, with no credentials', async () => {
    await resendEmailConfirmation('a@b.kz', 'en');

    expect(mockRequest).toHaveBeenCalledWith('/auth/email/resend', { method: 'POST', body: { email: 'a@b.kz', locale: 'en' } });
  });
});

describe('ForgotPasswordFlow', () => {
  const mount = async (initialEmail = '') => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
          <ThemeProvider>
            <ForgotPasswordFlow initialEmail={initialEmail} onClose={() => undefined} />
          </ThemeProvider>
        </SafeAreaProvider>
      );
    });
    return renderer;
  };

  it('sends the typed address and then shows the same neutral confirmation', async () => {
    const renderer = await mount('alice@example.kz');

    await act(async () => {
      pressByLabel(renderer, 'Отправить ссылку');
    });

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockRequest.mock.calls[0][1].body.email).toBe('alice@example.kz');
    expect(textOf(renderer)).toContain('Если такой адрес зарегистрирован');
  });

  it('does not call the server for a malformed address', async () => {
    const renderer = await mount('not-an-address');

    await act(async () => {
      pressByLabel(renderer, 'Отправить ссылку');
    });

    expect(mockRequest).not.toHaveBeenCalled();
    expect(renderer.root.findAllByType(TextInput).length).toBeGreaterThan(0);
  });

  it('shows a transport failure and stays on the form', async () => {
    mockRequest.mockRejectedValue(new Error('Нет соединения'));
    const renderer = await mount('alice@example.kz');

    await act(async () => {
      pressByLabel(renderer, 'Отправить ссылку');
    });

    expect(textOf(renderer)).toContain('Нет соединения');
    expect(textOf(renderer)).not.toContain('Если такой адрес зарегистрирован');
  });
});

describe('EmailConfirmBanner', () => {
  const mount = async () => {
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <ThemeProvider>
          <EmailConfirmBanner email="alice@example.kz" />
        </ThemeProvider>
      );
    });
    return renderer;
  };
  const buttons = (renderer: ReturnType<typeof create>) =>
    renderer.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');

  it('names the address, says orders still work, and resends on request', async () => {
    const renderer = await mount();
    expect(textOf(renderer)).toContain('alice@example.kz');
    expect(textOf(renderer)).toContain('Заказы доступны и без подтверждения');

    await act(async () => {
      buttons(renderer)[0].props.onPress();
    });

    expect(mockRequest).toHaveBeenCalledWith('/auth/email/resend', expect.objectContaining({ body: expect.objectContaining({ email: 'alice@example.kz' }) }));
    expect(textOf(renderer)).toContain('Письмо отправлено');
  });

  it('"I have confirmed" re-reads the account', async () => {
    const renderer = await mount();

    await act(async () => {
      buttons(renderer)[1].props.onPress();
    });

    expect(mockReloadUser).toHaveBeenCalledTimes(1);
  });
});

describe('registration messages', () => {
  it('a breached password gets its own translated message', () => {
    expect(authErrorKey('register', 'This password has appeared in a data breach - choose another one.')).toEqual({ key: 'mobile.passwordBreached' });
  });
});

describe('texts exist in all three languages', () => {
  const keys = ['forgotPassword', 'forgotTitle', 'forgotText', 'forgotSend', 'forgotSent', 'emailBannerText', 'emailBannerResend', 'emailBannerCheck', 'emailBannerSent', 'passwordBreached'] as const;

  it.each(keys)('mobile.%s', (key) => {
    for (const dict of [ru, kk, en]) {
      expect(dict.mobile[key].trim().length).toBeGreaterThan(3);
    }
  });
});
