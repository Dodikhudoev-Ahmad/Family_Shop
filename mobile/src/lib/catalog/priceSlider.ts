/** Pure maths of the price slider (kept apart from the gesture code so it can be tested). */

/** A comfortable step for a price window: 100 for a wide one, finer for a narrow one, never below 1. */
export function priceStep(min: number, max: number): number {
  const span = max - min;
  if (span >= 20000) return 100;
  if (span >= 2000) return 50;
  if (span >= 200) return 10;
  return 1;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Position (0..width) of a value on the track. A flat range (min = max) puts everything at the left end. */
export function positionOf(value: number, min: number, max: number, width: number): number {
  if (max <= min || width <= 0) return 0;
  return clamp(((value - min) / (max - min)) * width, 0, width);
}

/** Value under a position on the track, snapped to `step` and kept inside [min, max]. */
export function valueAt(x: number, min: number, max: number, width: number, step: number): number {
  if (max <= min || width <= 0) return min;
  const raw = min + (clamp(x, 0, width) / width) * (max - min);
  const snapped = Math.round((raw - min) / step) * step + min;
  return clamp(snapped, min, max);
}

/** Moves the lower thumb to `value`; it can never pass the upper one. */
export function moveFrom(range: [number, number], value: number, min: number): [number, number] {
  return [clamp(value, min, range[1]), range[1]];
}

/** Moves the upper thumb to `value`; it can never pass the lower one. */
export function moveTo(range: [number, number], value: number, max: number): [number, number] {
  return [range[0], clamp(value, range[0], max)];
}
