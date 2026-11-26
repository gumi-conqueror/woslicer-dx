import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WHEELS,
  stepWheel,
  WHEEL_SLOTS,
  WHEEL_TAP_MS,
  type WheelEvent,
  type WheelState,
} from '../../src/input/wheel';
import { isAppCommand } from '../../src/app/commands';

function run(events: readonly WheelEvent[], start: WheelState = { open: false, page: 0 }) {
  let state = start;
  const chosen: number[] = [];
  for (const event of events) {
    const step = stepWheel(state, event);
    state = step.state;
    if (step.chosen !== undefined) chosen.push(step.chosen);
  }
  return { state, chosen };
}
const point = (x: number, y: number, keepAtCenter = false): WheelEvent => ({
  type: 'point',
  x,
  y,
  keepAtCenter,
});
const selected = (state: WheelState) => (state.open ? state.selected : undefined);

describe('command wheel', () => {
  it('maps directions clockwise from the top to the eight slots', () => {
    const r = Math.SQRT1_2;
    const directions = [
      [0, -1],
      [r, -r],
      [1, 0],
      [r, r],
      [0, 1],
      [-r, r],
      [-1, 0],
      [-r, -r],
    ] as const;
    expect(directions).toHaveLength(WHEEL_SLOTS);
    for (const [slot, [x, y]] of directions.entries())
      expect(selected(run([{ type: 'open', time: 0 }, point(x, y)]).state)).toBe(slot);
  });
  it('runs the pointed slot on release and cancels a release at the center', () => {
    expect(run([{ type: 'open', time: 0 }, point(1, 0), { type: 'release', time: 900 }])).toEqual({
      state: { open: false, page: 0 },
      chosen: [2],
    });
    // A mouse returning to the center leaves its slot.
    const back = run([
      { type: 'open', time: 0 },
      point(1, 0),
      point(0.1, 0),
      { type: 'release', time: 900 },
    ]);
    expect(back).toEqual({ state: { open: false, page: 0 }, chosen: [] });
    // A stick springs back; its last slot stays chosen.
    const stick = run([
      { type: 'open', time: 0 },
      point(1, 0, true),
      point(0, 0, true),
      { type: 'release', time: 900 },
    ]);
    expect(stick.chosen).toEqual([2]);
  });
  it('needs enough travel to select and keeps a slot across its edge', () => {
    // 0.5 travel is below the 0.55 selection threshold.
    expect(selected(run([{ type: 'open', time: 0 }, point(0.5, 0)]).state)).toBeNull();
    // 25° from the top is past the 22.5° slot edge but inside the 6° margin.
    const angle = (25 * Math.PI) / 180;
    const near = point(Math.sin(angle), -Math.cos(angle));
    expect(selected(run([{ type: 'open', time: 0 }, point(0, -1), near]).state)).toBe(0);
    expect(selected(run([{ type: 'open', time: 0 }, near]).state)).toBe(1);
  });
  it('keeps the wheel open after a short tap until a confirm, choice or second press', () => {
    const tapped = run([
      { type: 'open', time: 0 },
      { type: 'release', time: WHEEL_TAP_MS - 1 },
    ]).state;
    expect(tapped).toMatchObject({ open: true, mode: 'sticky' });
    expect(run([{ type: 'confirm' }], tapped).chosen).toEqual([]);
    expect(
      run([point(-1, 0), { type: 'release', time: 999 }, { type: 'confirm' }], tapped).chosen,
    ).toEqual([6]);
    expect(run([{ type: 'choose', slot: 4 }], tapped).chosen).toEqual([4]);
    expect(run([{ type: 'open', time: 999 }], tapped).state.open).toBe(false);
    // A long hold without pointing closes without running anything.
    expect(
      run([
        { type: 'open', time: 0 },
        { type: 'release', time: WHEEL_TAP_MS },
      ]),
    ).toEqual({ state: { open: false, page: 0 }, chosen: [] });
  });
  it('switches pages in both directions and remembers the page', () => {
    const pages = DEFAULT_WHEELS.length;
    const { state } = run([
      { type: 'open', time: 0 },
      { type: 'page', delta: -1, pages },
      { type: 'cancel' },
    ]);
    expect(state).toEqual({ open: false, page: pages - 1 });
    expect(run([{ type: 'open', time: 0 }], state).state.page).toBe(pages - 1);
  });
  it('fills every default slot with a command that takes no arguments', () => {
    for (const page of DEFAULT_WHEELS) {
      expect(page).toHaveLength(WHEEL_SLOTS);
      for (const command of page) {
        expect(isAppCommand(command)).toBe(true);
        expect(command).not.toBe('recording-tap');
      }
    }
  });
});
