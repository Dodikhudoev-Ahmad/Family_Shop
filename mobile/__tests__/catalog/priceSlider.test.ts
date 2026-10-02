import { moveFrom, moveTo, positionOf, priceStep, valueAt } from '../../src/lib/catalog/priceSlider';

describe('price slider maths', () => {
  it('maps values to track positions and back, snapped to the step', () => {
    expect(positionOf(900, 900, 4000, 310)).toBe(0);
    expect(positionOf(4000, 900, 4000, 310)).toBe(310);
    expect(positionOf(2450, 900, 4000, 310)).toBeCloseTo(155, 5);
    expect(valueAt(0, 900, 4000, 310, 50)).toBe(900);
    expect(valueAt(310, 900, 4000, 310, 50)).toBe(4000);
    expect(valueAt(155, 900, 4000, 310, 50)).toBe(2450);
    expect(valueAt(160, 900, 4000, 310, 50) % 50).toBe(0);
  });

  it('keeps values inside the bounds however far the finger goes', () => {
    expect(valueAt(-80, 900, 4000, 310, 50)).toBe(900);
    expect(valueAt(9999, 900, 4000, 310, 50)).toBe(4000);
    expect(positionOf(10, 900, 4000, 310)).toBe(0);
    expect(positionOf(99999, 900, 4000, 310)).toBe(310);
  });

  it('survives a flat or empty range without dividing by zero', () => {
    expect(positionOf(500, 500, 500, 300)).toBe(0);
    expect(valueAt(120, 500, 500, 300, 1)).toBe(500);
    expect(valueAt(120, 0, 0, 0, 1)).toBe(0);
  });

  it('the thumbs never cross each other', () => {
    expect(moveFrom([1000, 3000], 3500, 900)).toEqual([3000, 3000]);
    expect(moveFrom([1000, 3000], 100, 900)).toEqual([900, 3000]);
    expect(moveTo([1000, 3000], 500, 4000)).toEqual([1000, 1000]);
    expect(moveTo([1000, 3000], 9000, 4000)).toEqual([1000, 4000]);
  });

  it('picks a step that suits the width of the window', () => {
    expect(priceStep(900, 50000)).toBe(100);
    expect(priceStep(900, 4000)).toBe(50);
    expect(priceStep(900, 1500)).toBe(10);
    expect(priceStep(900, 950)).toBe(1);
  });
});
