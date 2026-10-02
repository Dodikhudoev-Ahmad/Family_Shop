import { act, create } from 'react-test-renderer';
import { deleteErrorKey } from '../src/components/DeleteAccountFlow';
import { ApiError } from '../src/lib/api/errors';
import type { SessionDto } from '../src/lib/api/types';
import { useSessions } from '../src/state/useSessions';

jest.mock('../src/lib/api/client', () => ({ api: { fetchSessions: jest.fn(), revokeSession: jest.fn() } }));
const { api } = jest.requireMock<{ api: { fetchSessions: jest.Mock<Promise<SessionDto[]>, []>; revokeSession: jest.Mock<Promise<void>, [string]> } }>('../src/lib/api/client');

const session = (id: string, isCurrent = false): SessionDto => ({
  sessionId: id, clientType: 'Mobile', deviceName: `Phone ${id}`, createdAt: '2026-10-01T10:00:00Z', lastUsedAt: '2026-10-02T10:00:00Z', isCurrent,
});

type Hook = ReturnType<typeof useSessions>;
async function mount() {
  const ref: { current: Hook | null } = { current: null };
  const Probe = () => {
    ref.current = useSessions();
    return null;
  };
  await act(async () => {
    create(<Probe />);
  });
  return ref;
}

beforeEach(() => {
  api.fetchSessions.mockReset();
  api.revokeSession.mockReset();
});

describe('deleting an account: what the screen shows for a refusal', () => {
  it('a wrong password and an administrator account get their own translated messages', () => {
    expect(deleteErrorKey(new ApiError(400, 'Incorrect password.'))).toEqual({ key: 'mobile.wrongPassword' });
    expect(deleteErrorKey(new ApiError(403, 'This account cannot be deleted from the app.'))).toEqual({ key: 'mobile.adminCannotDelete' });
  });
  it('active orders (409 active_orders) get an explanation, and any other 409 text is shown as it came', () => {
    expect(deleteErrorKey(new ApiError(409, 'active_orders'))).toEqual({ key: 'mobile.activeOrdersCannotDelete' });
    expect(deleteErrorKey(new ApiError(409, 'Something else'))).toEqual({ raw: 'Something else' });
  });
  it('anything else is shown as the client/server produced it (network, rate limit)', () => {
    expect(deleteErrorKey(new ApiError(429, 'Слишком много попыток.'))).toEqual({ raw: 'Слишком много попыток.' });
    expect(deleteErrorKey(new ApiError(0, 'offline'))).toEqual({ raw: 'offline' });
    expect(deleteErrorKey('weird')).toEqual({ raw: '' });
  });
});

describe('devices (sessions)', () => {
  it('loads the list; the server flags the current device', async () => {
    api.fetchSessions.mockResolvedValue([session('a', true), session('b')]);
    const ref = await mount();
    expect(ref.current?.sessions?.map((s) => [s.sessionId, s.isCurrent])).toEqual([['a', true], ['b', false]]);
    expect(ref.current?.loading).toBe(false);
  });

  it('ending another device calls DELETE for that id and refreshes the list', async () => {
    api.fetchSessions.mockResolvedValueOnce([session('a', true), session('b')]).mockResolvedValueOnce([session('a', true)]);
    api.revokeSession.mockResolvedValue(undefined);
    const ref = await mount();
    await act(async () => ref.current?.revoke('b'));
    expect(api.revokeSession).toHaveBeenCalledWith('b');
    expect(ref.current?.sessions?.map((s) => s.sessionId)).toEqual(['a']);
  });

  it('a session that is already gone (404) is not an error - the list just refreshes', async () => {
    api.fetchSessions.mockResolvedValue([session('a', true)]);
    api.revokeSession.mockRejectedValue(new ApiError(404, 'Session not found.'));
    const ref = await mount();
    await act(async () => ref.current?.revoke('ghost'));
    expect(api.fetchSessions).toHaveBeenCalledTimes(2);
  });

  it('any other failure (network) is thrown to the screen and the list is kept', async () => {
    api.fetchSessions.mockResolvedValue([session('a', true), session('b')]);
    api.revokeSession.mockRejectedValue(new ApiError(0, 'offline'));
    const ref = await mount();
    let caught: unknown;
    await act(async () => {
      try {
        await ref.current?.revoke('b');
      } catch (e) {
        caught = e;
      }
    });
    expect((caught as ApiError).status).toBe(0);
    expect(ref.current?.sessions).toHaveLength(2);
  });

  it('a failing load is reported with the message (and can be retried)', async () => {
    api.fetchSessions.mockRejectedValueOnce(new ApiError(0, 'offline')).mockResolvedValueOnce([session('a', true)]);
    const ref = await mount();
    expect(ref.current?.error).toBe('offline');
    await act(async () => ref.current?.reload());
    expect(ref.current?.error).toBeNull();
    expect(ref.current?.sessions).toHaveLength(1);
  });
});
