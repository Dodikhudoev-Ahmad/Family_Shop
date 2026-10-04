// The shop works in one time zone (the server's Store:TimeZone, Asia/Almaty by default), and the dashboard's "today", the
// date filters and the dates in the orders list all follow it. Dates arrive in UTC; they are shown in the shop's zone,
// not the browser's, so an admin abroad - or a laptop on the wrong zone - sees the same day the figures were counted for.
let storeTimeZone: string | undefined;

/** Set from the stats the server returns; an unknown or invalid zone falls back to the browser's own. */
export function setStoreTimeZone(zone: string | null | undefined): void {
  if (!zone) {
    storeTimeZone = undefined;
    return;
  }
  try {
    new Intl.DateTimeFormat('ru-RU', { timeZone: zone });
    storeTimeZone = zone;
  } catch {
    storeTimeZone = undefined;
  }
}

export function formatStoreDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', timeZone: storeTimeZone });
}

export function formatStoreDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: storeTimeZone,
  });
}

/** Today's calendar day in the shop's zone as yyyy-MM-dd (what a date input and the finance API speak). */
export function storeTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: storeTimeZone }).format(now);
}

/** "окт. 2026" for a yyyy-MM month of the shop's calendar. The month is a calendar label, so no time zone shifts it. */
export function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}
