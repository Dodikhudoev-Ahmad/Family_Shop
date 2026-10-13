import { describe, expect, it } from 'vitest';
import { audienceKey, shoeRange } from './shoeAudience';

describe('audienceKey', () => {
  it('names boys, girls and teens', () => {
    expect(audienceKey({ shoeSegment: 'kids', childGender: 'boy' })).toBe('kidsBoy');
    expect(audienceKey({ shoeSegment: 'kids', childGender: 'girl' })).toBe('kidsGirl');
    expect(audienceKey({ shoeSegment: 'teen', childGender: 'boy' })).toBe('teenBoy');
    expect(audienceKey({ shoeSegment: 'teen', childGender: 'girl' })).toBe('teenGirl');
  });

  it('falls back to the group name until a boy or girl is chosen', () => {
    expect(audienceKey({ shoeSegment: 'kids' })).toBe('kids');
    expect(audienceKey({ shoeSegment: 'teen' })).toBe('teen');
  });

  it('has nothing to say about adult shoes and other products', () => {
    expect(audienceKey({ shoeSegment: 'men' })).toBeNull();
    expect(audienceKey({ shoeSegment: 'women' })).toBeNull();
    expect(audienceKey({})).toBeNull();
  });
});

describe('shoeRange', () => {
  it('takes the ends of the grid the server sent', () => {
    expect(shoeRange(['28', '27', '29', '37'])).toEqual({ from: '27', to: '37' });
  });

  it('has no range for sizeless products or clothing-less grids of one size', () => {
    expect(shoeRange(undefined)).toBeNull();
    expect(shoeRange([])).toBeNull();
    expect(shoeRange(['37'])).toBeNull();
  });
});
