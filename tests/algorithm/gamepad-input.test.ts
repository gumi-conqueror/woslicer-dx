import { describe, expect, it } from 'vitest';
import {
  createGamepadReader,
  pointingVector,
  uiNavigation,
  type GamepadEvent,
} from '../../src/input/gamepad';

function pad(
  buttons: number[] = [],
  axes = [0, 0, 0, 0],
): Pick<Gamepad, 'index' | 'buttons' | 'axes'> {
  return {
    index: 0,
    axes,
    buttons: Array.from({ length: 17 }, (_, index) => ({
      pressed: buttons.includes(index),
      touched: false,
      value: buttons.includes(index) ? 1 : 0,
    })),
  };
}
const pressed = (events: readonly GamepadEvent[]) =>
  events.filter((event) => event.phase !== 'release').map((event) => event.control);

describe('controller reader', () => {
  it('presses edit buttons once, repeats directions after a delay and reports releases', () => {
    const read = createGamepadReader();
    expect(read(pad([2]), 0, true)).toEqual([{ control: 'x', phase: 'press' }]);
    expect(read(pad([2]), 500, true)).toEqual([]);
    expect(read(pad(), 510, true)).toEqual([{ control: 'x', phase: 'release' }]);
    expect(read(pad([15]), 600, true)).toEqual([{ control: 'dpad-right', phase: 'press' }]);
    expect(read(pad([15]), 900, true)).toEqual([]);
    // 600 + 380 ms delay, then every 110 ms.
    expect(read(pad([15]), 980, true)).toEqual([{ control: 'dpad-right', phase: 'repeat' }]);
    expect(read(pad([15]), 1000, true)).toEqual([]);
    expect(read(pad([15]), 1090, true)).toEqual([{ control: 'dpad-right', phase: 'repeat' }]);
  });
  it('presses a trigger on a light touch and releases it below a lower travel', () => {
    const read = createGamepadReader();
    const trigger = (value: number) => {
      const state = pad();
      const button = state.buttons[7];
      if (button) Object.assign(button, { value, pressed: value > 0.5 });
      return state;
    };
    // A trigger stop can end travel near 0.2; 0.12 already counts.
    expect(read(trigger(0.1), 0, true)).toEqual([]);
    expect(read(trigger(0.13), 10, true)).toEqual([{ control: 'rt', phase: 'press' }]);
    // Resting just under the press threshold keeps it held.
    expect(read(trigger(0.08), 20, true)).toEqual([]);
    expect(read(trigger(0.05), 30, true)).toEqual([{ control: 'rt', phase: 'release' }]);
  });
  it('keeps the triggers and face buttons from repeating', () => {
    const read = createGamepadReader();
    expect(pressed(read(pad([6, 7, 0]), 0, true))).toEqual(['a', 'lt', 'rt']);
    expect(read(pad([6, 7, 0]), 2000, true)).toEqual([]);
  });
  it('separates the sticks from the D-pad and uses the dominant axis of each stick', () => {
    const read = createGamepadReader();
    // Stick drift below the 0.4 light-push travel does nothing.
    expect(read(pad([], [0.25, -0.3, 0, 0]), 0, true)).toEqual([]);
    expect(pressed(read(pad([15], [0.8, -0.6, 0, 0]), 10, true))).toEqual([
      'dpad-right',
      'ls-right',
    ]);
    read(pad(), 20, true);
    // 0.9 travel and more is a hard push.
    expect(pressed(read(pad([], [0, 0, -0.3, 0.9]), 30, true))).toEqual(['rs-down-hard']);
    read(pad(), 40, true);
    expect(pressed(read(pad([10, 11]), 50, true))).toEqual(['ls', 'rs']);
  });
  it('repeats a light push steadily and a hard push faster the longer it is held', () => {
    const read = createGamepadReader();
    const light = pad([], [0.6, 0, 0, 0]);
    expect(read(light, 0, true)).toEqual([{ control: 'ls-right', phase: 'press' }]);
    expect(read(light, 380, true)).toEqual([{ control: 'ls-right', phase: 'repeat' }]);
    // A light push keeps the 110 ms rate however long it is held.
    expect(read(light, 3000, true)).toEqual([{ control: 'ls-right', phase: 'repeat' }]);
    expect(read(light, 3109, true)).toEqual([]);
    expect(read(light, 3110, true)).toEqual([{ control: 'ls-right', phase: 'repeat' }]);
    // Pushing further switches to the hard control.
    const hard = pad([], [1, 0, 0, 0]);
    expect(read(hard, 3200, true)).toEqual([
      { control: 'ls-right', phase: 'release' },
      { control: 'ls-right-hard', phase: 'press' },
    ]);
    // Held 700 ms (380 ms delay, then repeats), the interval halves to 55 ms.
    expect(read(hard, 3580, true)).toEqual([{ control: 'ls-right-hard', phase: 'repeat' }]);
    read(hard, 3900, true);
    expect(read(hard, 3954, true)).toEqual([]);
    expect(read(hard, 3956, true)).toEqual([{ control: 'ls-right-hard', phase: 'repeat' }]);
    // After several seconds it reaches the 25 ms floor.
    read(hard, 9000, true);
    expect(read(hard, 9024, true)).toEqual([]);
    expect(read(hard, 9025, true)).toEqual([{ control: 'ls-right-hard', phase: 'repeat' }]);
  });
  it('requires neutral controls after focus loss and clears disconnected inputs', () => {
    const read = createGamepadReader();
    expect(read(pad([0]), 0, false)).toEqual([]);
    expect(read(pad([0]), 500, true)).toEqual([]);
    // A press made while suspended releases silently.
    expect(read(pad(), 510, true)).toEqual([]);
    expect(pressed(read(pad([0]), 520, true))).toEqual(['a']);
    read(undefined, 530, true);
    expect(pressed(read(pad([0]), 540, true))).toEqual(['a']);
  });
  it('measures circular left-stick motion in recording mode without other stick events', () => {
    const read = createGamepadReader();
    read(pad(), 0, true, true);
    const position = (angle: number, time: number) =>
      pressed(read(pad([], [Math.cos(angle), Math.sin(angle), 0, 0]), time, true, true));
    expect(position(0, 10)).toEqual([]);
    expect(position(0, 500)).toEqual([]);
    for (let step = 1; step <= 8; step++)
      expect(position((step * Math.PI) / 4, step * 20 + 500)).toEqual(['ls-clockwise']);
    for (let step = 7; step >= 0; step--)
      expect(position((step * Math.PI) / 4, 900 - step * 20)).toEqual(['ls-counterclockwise']);
    read(pad(), 1100, true, true);
    expect(position(Math.PI, 1200)).toEqual([]);
    expect(position(0, 1300)).toEqual([]);
  });
  it('requires neutral after entering recording mode and never repeats in it', () => {
    const read = createGamepadReader();
    expect(read(pad([0]), 0, true, true)).toEqual([]);
    read(pad(), 1, true, true);
    expect(pressed(read(pad([12]), 2, true, true))).toEqual(['dpad-up']);
    expect(read(pad([12]), 900, true, true)).toEqual([]);
    expect(read(pad([12]), 901, true, false)).toEqual([]);
  });
});

describe('controller navigation', () => {
  it('maps the fixed buttons for menus and dialogs', () => {
    expect(uiNavigation('menu')).toBe('toggle');
    expect(uiNavigation('a')).toBe('confirm');
    expect(uiNavigation('b')).toBe('cancel');
    expect(uiNavigation('lb')).toBe('previous');
    expect(uiNavigation('dpad-right')).toBe('next');
    expect(uiNavigation('ls-up')).toBe('up');
    expect(uiNavigation('dpad-left', true)).toBe('left');
    expect(uiNavigation('rt')).toBe('scroll-down');
    expect(uiNavigation('x')).toBeUndefined();
  });
  it('points the wheel with the right stick, then the left stick, then the D-pad', () => {
    expect(pointingVector(pad([12, 15], [0.9, 0, 0, -0.8]))).toEqual({
      x: 0,
      y: -0.8,
      from: 'stick',
    });
    expect(pointingVector(pad([12, 15], [0.9, 0, 0, 0]))).toEqual({ x: 0.9, y: 0, from: 'stick' });
    expect(pointingVector(pad([12, 15]))).toEqual({ x: 1, y: -1, from: 'dpad' });
    expect(pointingVector(undefined)).toEqual({ x: 0, y: 0, from: null });
  });
});
