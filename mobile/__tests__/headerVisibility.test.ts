import { DIRECTION_DEADZONE, HIDE_START, INITIAL_HEADER_VISIBILITY, nextHeaderVisibility, type HeaderVisibility } from '../src/lib/headerVisibility';

const run = (ys: number[], start: HeaderVisibility = INITIAL_HEADER_VISIBILITY, overlay = false) =>
  ys.reduce<HeaderVisibility>((state, y) => nextHeaderVisibility(state, y, overlay), start);

describe('smart header (same rule as the website)', () => {
  it('uses the website numbers: 80px to start hiding, a 32px deadzone', () => {
    expect(HIDE_START).toBe(80);
    expect(DIRECTION_DEADZONE).toBe(32);
  });

  it('stays visible near the top, however it is scrolled there', () => {
    expect(run([0, 20, 79, 80]).hidden).toBe(false);
    expect(run([-30]).hidden).toBe(false); // iOS rubber-band overscroll
  });

  it('hides when scrolling down past the deadzone below 80px', () => {
    expect(run([100, 140]).hidden).toBe(true);
  });

  it('comes back as soon as the user scrolls up past the deadzone', () => {
    const hidden = run([100, 300, 600]);
    expect(hidden.hidden).toBe(true);
    expect(run([570], hidden).hidden).toBe(true); // 30px up: still inside the deadzone
    expect(run([560], hidden).hidden).toBe(false); // 40px up: back
  });

  it('is not shaken by the wobble of a settling wheel scroll (20-30px back-steps in a downward gesture)', () => {
    // down to 600, then the scroll "settles" with small reversals; the header must stay hidden throughout
    const wobble = run([100, 200, 400, 600, 590, 580, 575, 585, 590, 600]);
    expect(wobble.hidden).toBe(true);
  });

  it('compares with the last decision point, not the previous sample (slow steady scroll up still reveals it)', () => {
    let state = run([100, 300, 600]);
    for (const y of [590, 580, 570, 560, 550, 540]) state = nextHeaderVisibility(state, y, false); // 10px steps
    expect(state.hidden).toBe(false); // cumulative 60px up from the anchor
  });

  it('never hides while an overlay (burger menu, language menu, search) is open, and resets the anchor', () => {
    const state = run([100, 500, 900], INITIAL_HEADER_VISIBILITY, true);
    expect(state.hidden).toBe(false);
    expect(state.anchorY).toBe(900);
  });

  it('a header that is already hidden is shown again when it reaches the top', () => {
    const hidden = run([100, 400, 700]);
    expect(run([60], hidden).hidden).toBe(false);
  });
});
