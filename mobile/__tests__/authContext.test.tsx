import { act, create } from 'react-test-renderer';
import { ApiError } from '../src/lib/api/errors';
import type { AuthUser } from '../src/lib/api/types';
import { AuthProvider, useAuth } from '../src/state/AuthContext';

const alice: AuthUser = { id: 1, email: 'alice@example.kz', name: 'Alice', role: 'Customer' };

jest.mock('../src/lib/api/client', () => ({
  api: {
    restoreSession: jest.fn(),
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    logoutAll: jest.fn(),
    onSignedOut: jest.fn(),
  },
}));

// Typed handles on the jest.fn()s created in the factory above.
const mockApi = jest.requireMock<{
  api: {
    restoreSession: jest.Mock<Promise<AuthUser | null>, []>;
    login: jest.Mock<Promise<AuthUser>, [string, string]>;
    register: jest.Mock<Promise<AuthUser>, [string, string, string]>;
    logout: jest.Mock<Promise<void>, []>;
    logoutAll: jest.Mock<Promise<void>, []>;
    onSignedOut: jest.Mock<() => void, [() => void]>;
  };
}>('../src/lib/api/client').api;

let signedOut: (() => void) | null = null;
type Auth = ReturnType<typeof useAuth>;

async function mount() {
  const ref: { current: Auth | null } = { current: null };
  const Probe = () => {
    ref.current = useAuth();
    return null;
  };
  await act(async () => {
    create(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
  });
  return ref;
}

beforeEach(() => {
  signedOut = null;
  Object.values(mockApi).forEach((m) => m.mockReset());
  mockApi.onSignedOut.mockImplementation((listener) => {
    signedOut = listener;
    return () => undefined;
  });
  mockApi.restoreSession.mockResolvedValue(null);
  mockApi.logout.mockResolvedValue(undefined);
  mockApi.logoutAll.mockResolvedValue(undefined);
});

describe('session at startup', () => {
  it('restores the signed-in user from the stored session', async () => {
    mockApi.restoreSession.mockResolvedValue(alice);
    const auth = await mount();
    expect(auth.current?.isLoading).toBe(false);
    expect(auth.current?.user).toEqual(alice);
  });

  it('is signed out (and says so quietly) when there is no stored session or the server refused it', async () => {
    const auth = await mount();
    expect(auth.current?.user).toBeNull();
    expect(auth.current?.isLoading).toBe(false);
    expect(auth.current?.sessionEnded).toBe(false);
  });

  it('stays loading until the check has finished', async () => {
    let finish!: (u: AuthUser | null) => void;
    mockApi.restoreSession.mockReturnValue(new Promise((res) => { finish = res; }));
    const auth = await mount();
    expect(auth.current?.isLoading).toBe(true);
    await act(async () => finish(alice));
    expect(auth.current?.isLoading).toBe(false);
    expect(auth.current?.user).toEqual(alice);
  });

  it('a failed restore does not crash the app: the user is simply a guest', async () => {
    mockApi.restoreSession.mockRejectedValue(new Error('boom'));
    const auth = await mount();
    expect(auth.current?.user).toBeNull();
    expect(auth.current?.isLoading).toBe(false);
  });
});

describe('login and register', () => {
  it('sign the user in', async () => {
    mockApi.login.mockResolvedValue(alice);
    const auth = await mount();
    await act(async () => auth.current?.login('alice@example.kz', 'pw'));
    expect(auth.current?.user).toEqual(alice);
    expect(mockApi.login).toHaveBeenCalledWith('alice@example.kz', 'pw');

    mockApi.register.mockResolvedValue({ ...alice, id: 2 });
    await act(async () => auth.current?.register('b@b.kz', 'pw12345x', 'Bob'));
    expect(auth.current?.user?.id).toBe(2);
  });

  it('a rejected login leaves the user signed out and hands the error to the form', async () => {
    mockApi.login.mockRejectedValue(new ApiError(401, 'Invalid email or password.'));
    const auth = await mount();
    let caught: unknown;
    await act(async () => {
      try {
        await auth.current?.login('a@b.kz', 'x');
      } catch (e) {
        caught = e;
      }
    });
    expect(caught).toBeInstanceOf(ApiError);
    expect(auth.current?.user).toBeNull();
  });
});

describe('the server ends the session', () => {
  it('a rejection (401/403) while using the app signs the user out and flags why', async () => {
    mockApi.restoreSession.mockResolvedValue(alice);
    const auth = await mount();
    await act(async () => signedOut?.());
    expect(auth.current?.user).toBeNull();
    expect(auth.current?.sessionEnded).toBe(true);
  });

  it('signing in again clears the flag', async () => {
    mockApi.restoreSession.mockResolvedValue(alice);
    mockApi.login.mockResolvedValue(alice);
    const auth = await mount();
    await act(async () => signedOut?.());
    await act(async () => auth.current?.login('alice@example.kz', 'pw'));
    expect(auth.current?.sessionEnded).toBe(false);
    expect(auth.current?.user).toEqual(alice);
  });
});

describe('logout', () => {
  it('revokes on the server, signs out, and is NOT reported as "session ended"', async () => {
    mockApi.restoreSession.mockResolvedValue(alice);
    mockApi.logout.mockImplementation(async () => {
      signedOut?.(); // the token store announces its own wipe
    });
    const auth = await mount();
    await act(async () => auth.current?.logout());
    expect(mockApi.logout).toHaveBeenCalledTimes(1);
    expect(auth.current?.user).toBeNull();
    expect(auth.current?.sessionEnded).toBe(false);
  });

  it('signs out locally even when "log out everywhere" fails (offline)', async () => {
    mockApi.restoreSession.mockResolvedValue(alice);
    mockApi.logoutAll.mockRejectedValue(new ApiError(0, 'offline'));
    const auth = await mount();
    await act(async () => {
      await auth.current?.logoutAll().catch(() => undefined);
    });
    expect(auth.current?.user).toBeNull();
  });
});
