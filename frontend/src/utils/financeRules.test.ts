import { describe, expect, it } from 'vitest';
import { amountError, MAX_EXPENSE, rangeError } from './financeRules';

describe('amountError (expense amount)', () => {
  it.each([['15000'], ['1'], ['15 000'], [String(MAX_EXPENSE)]])('accepts %s', (raw) => expect(amountError(raw)).toBeNull());

  it.each([
    ['', 'Укажите сумму.'],
    ['   ', 'Укажите сумму.'],
    ['0', 'Сумма должна быть больше нуля.'],
    ['000', 'Сумма должна быть больше нуля.'],
    ['-5', 'Сумма — целое число тенге.'],
    ['10.5', 'Сумма — целое число тенге.'],
    ['10,5', 'Сумма — целое число тенге.'],
    ['1e3', 'Сумма — целое число тенге.'],
    ['abc', 'Сумма — целое число тенге.'],
    [String(MAX_EXPENSE + 1), 'Сумма слишком большая.'],
  ])('refuses %j', (raw, message) => expect(amountError(raw)).toBe(message));
});

describe('rangeError (period of days)', () => {
  it('accepts empty, one-sided, equal and ordered ranges', () => {
    expect(rangeError('', '')).toBeNull();
    expect(rangeError('2026-10-01', '')).toBeNull();
    expect(rangeError('', '2026-10-01')).toBeNull();
    expect(rangeError('2026-10-04', '2026-10-04')).toBeNull();
    expect(rangeError('2026-10-01', '2026-10-31')).toBeNull();
  });

  it('refuses a reversed range', () => {
    expect(rangeError('2026-10-05', '2026-10-01')).toMatch(/позже/);
  });

  it('allows 366 days inclusive and refuses 367', () => {
    expect(rangeError('2025-01-01', '2026-01-01')).toBeNull(); // 366 days, both ends counted
    expect(rangeError('2025-01-01', '2026-01-02')).toMatch(/366/);
  });
});
