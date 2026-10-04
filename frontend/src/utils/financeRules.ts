// Client-side mirrors of the finance API's input rules (see docs/Money.md, "Финансы"): they only save a round trip,
// the server checks everything again. Dates are yyyy-MM-dd calendar days.

/** The longest range the API accepts (366 days, both ends included). */
export const MAX_RANGE_DAYS = 366;
export const MAX_EXPENSE = 1_000_000_000;
export const MAX_COMMENT = 500;

const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

/** A message when the two days can't be sent to the API, otherwise null. Either may be empty. */
export function rangeError(from: string, to: string): string | null {
  if (from && to && from > to) return 'Дата «от» позже даты «до».';
  if (from && to && dayNumber(to) - dayNumber(from) + 1 > MAX_RANGE_DAYS) return `Период не может быть длиннее ${MAX_RANGE_DAYS} дней.`;
  return null;
}

/** Why an amount can't be an expense (whole tenge, above zero, within the cap), or null. */
export function amountError(raw: string): string | null {
  const text = raw.replace(/\s/g, '');
  if (!text) return 'Укажите сумму.';
  if (!/^\d+$/.test(text)) return 'Сумма — целое число тенге.';
  const value = Number(text);
  if (value <= 0) return 'Сумма должна быть больше нуля.';
  if (value > MAX_EXPENSE) return 'Сумма слишком большая.';
  return null;
}
