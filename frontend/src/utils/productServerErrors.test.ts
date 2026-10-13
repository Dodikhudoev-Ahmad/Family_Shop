import { describe, expect, it } from 'vitest';
import { splitServerErrors } from './productServerErrors';

describe('splitServerErrors', () => {
  it('puts size and audience messages on their fields and keeps the rest for the form', () => {
    const { fields, rest } = splitServerErrors(
      'Размер «45» не входит в размерную сетку этого типа товаров.; Укажите, для кого обувь: мальчик или девочка.; Категория не найдена.',
    );

    expect(fields.sizes).toBe('Размер «45» не входит в размерную сетку этого типа товаров.');
    expect(fields.childGender).toBe('Укажите, для кого обувь: мальчик или девочка.');
    expect(rest).toEqual(['Категория не найдена.']);
  });

  it('recognises a segment that does not fit the product', () => {
    expect(splitServerErrors('Возрастная группа не соответствует полу товара.').fields.shoeSegment).toBeDefined();
  });

  it('leaves an unrelated message alone', () => {
    expect(splitServerErrors('Товар не найден.')).toEqual({ fields: {}, rest: ['Товар не найден.'] });
  });
});
