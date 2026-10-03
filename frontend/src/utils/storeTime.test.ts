import { afterEach, describe, expect, it } from 'vitest';
import { formatStoreDate, formatStoreDateTime, setStoreTimeZone } from './storeTime';

afterEach(() => setStoreTimeZone(undefined));

describe('shop time in the orders list', () => {
  // 19:30 UTC on 3 Oct is 00:30 on 4 Oct in Almaty.
  const lateEvening = '2026-10-03T19:30:00Z';

  it('shows an order placed at 00:30 local on the shop\'s day, not the previous UTC day', () => {
    setStoreTimeZone('Asia/Almaty');

    expect(formatStoreDate(lateEvening)).toContain('4');
    expect(formatStoreDateTime(lateEvening)).toMatch(/4.*00:30/);
  });

  it('shows 23:30 local (18:30 UTC) on the same day, at 23:30', () => {
    setStoreTimeZone('Asia/Almaty');

    expect(formatStoreDateTime('2026-10-03T18:30:00Z')).toMatch(/3.*23:30/);
  });

  it('follows the zone the server reports, whatever the browser zone is', () => {
    setStoreTimeZone('Asia/Almaty');
    const almaty = formatStoreDateTime(lateEvening);
    setStoreTimeZone('Pacific/Honolulu'); // UTC-10: 09:30 on 3 Oct

    expect(formatStoreDateTime(lateEvening)).not.toBe(almaty);
    expect(formatStoreDateTime(lateEvening)).toMatch(/3.*09:30/);
  });

  it('ignores an invalid zone instead of failing the page', () => {
    setStoreTimeZone('Not/AZone');

    expect(() => formatStoreDate(lateEvening)).not.toThrow();
  });
});
