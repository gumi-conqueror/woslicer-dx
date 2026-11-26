import { describe, expect, it } from 'vitest';
import {
  createGamepadReader,
  GAMEPAD_CONTROLS,
  GAMEPAD_MENU_SHORTCUTS,
} from '../../src/input/gamepad';
import { GAMEPAD_SHORTCUTS, SHORTCUTS } from '../../src/input/bindings';
import { APPLICATION_MENU } from '../../src/app/menu';

function pad(buttons: number[] = [], axes = [0, 0]): Pick<Gamepad, 'index' | 'buttons' | 'axes'> {
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
describe('controller input', () => {
  it('triggers edits once per press but repeats navigation with a delay', () => {
    const read = createGamepadReader();
    expect(read(pad([2]), 0, true)).toEqual(['x']);
    expect(read(pad([2]), 500, true)).toEqual([]);
    read(pad(), 510, true);
    expect(read(pad([2]), 520, true)).toEqual(['x']);
    expect(read(pad([15]), 600, true)).toEqual(['right']);
    expect(read(pad([15]), 900, true)).toEqual([]);
    expect(read(pad([15]), 980, true)).toEqual(['right']);
    expect(read(pad([15]), 1000, true)).toEqual([]);
    expect(read(pad([15]), 1090, true)).toEqual(['right']);
  });
  it('ignores stick drift, chooses the dominant axis and merges stick and D-pad', () => {
    const read = createGamepadReader();
    expect(read(pad([], [0.25, -0.3]), 0, true)).toEqual([]);
    expect(read(pad([15], [0.8, -0.6]), 10, true)).toEqual(['right']);
    expect(read(pad([], [0, -0.9]), 20, true)).toEqual(['up']);
  });
  it('requires neutral controls after focus loss and clears disconnected inputs', () => {
    const read = createGamepadReader();
    expect(read(pad([0]), 0, false)).toEqual([]);
    expect(read(pad([0]), 500, true)).toEqual([]);
    read(pad(), 510, true);
    expect(read(pad([0]), 520, true)).toEqual(['a']);
    read(undefined, 530, true);
    expect(read(pad([0]), 540, true)).toEqual(['a']);
  });
  it('gives every mapped command a help label and every menu unique mnemonics', () => {
    expect(new Set(GAMEPAD_SHORTCUTS.map((item) => item.control)).size).toBe(
      GAMEPAD_SHORTCUTS.length,
    );
    for (const binding of GAMEPAD_SHORTCUTS) {
      expect(SHORTCUTS.some((item) => item.command === binding.command)).toBe(true);
      expect(GAMEPAD_CONTROLS.some((item) => item.id === binding.control)).toBe(true);
    }
    expect(
      GAMEPAD_MENU_SHORTCUTS.some((item) => item.control === 'menu' && item.action === 'toggle'),
    ).toBe(true);
    expect(new Set(APPLICATION_MENU.map((group) => group.mnemonic)).size).toBe(
      APPLICATION_MENU.length,
    );
    for (const group of APPLICATION_MENU)
      expect(new Set(group.commands.map((item) => item.mnemonic)).size).toBe(group.commands.length);
  });
});
