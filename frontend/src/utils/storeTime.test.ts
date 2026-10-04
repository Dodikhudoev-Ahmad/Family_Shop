import { afterEach, describe, expect, it } from 'vitest';
import { formatMonthLabel, formatStoreDate, formatStoreDateTime, setStoreTimeZone, storeTodayIso } from './storeTime';

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

describe('the shop\'s calendar for the finance page', () => {
  it('"today" is the shop\'s day: 00:30 in Almaty is already the next day, though UTC is not', () => {
    setStoreTimeZone('Asia/Almaty');
    expect(storeTodayIso(new Date('2026-10-03T19:30:00Z'))).toBe('2026-10-04');
    expect(storeTodayIso(new Date('2026-10-03T18:59:59Z'))).toBe('2026-10-03');
  });

  it('follows the zone the server reports', () => {
    setStoreTimeZone('Pacific/Honolulu'); // UTC-10
    expect(storeTodayIso(new Date('2026-10-04T05:00:00Z'))).toBe('2026-10-03');
  });

  it('labels a month by its calendar name, whatever the browser zone', () => {
    expect(formatMonthLabel('2026-10')).toMatch(/окт/i);
    expect(formatMonthLabel('2026-01')).toMatch(/янв/i);
    expect(formatMonthLabel('2026-01')).toContain('26');
  });
});
