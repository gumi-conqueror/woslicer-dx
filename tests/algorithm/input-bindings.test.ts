import { describe, expect, it } from 'vitest';
import {
  BINDINGS,
  gamepadBinding,
  gamepadControls,
  keyBinding,
  shortcutLabel,
  yuanconBinding,
  type InputLayer,
} from '../../src/input/bindings';
import { routeGamepad, routeYuancon } from '../../src/input/router';
import { COMMANDS, isAppCommand } from '../../src/app/commands';
import { codeForKey } from '../../src/input/recording';
import { createI18n } from 'vue-i18n';
import en from '../../src/i18n/en.json';
import zh from '../../src/i18n/zh.json';
import ja from '../../src/i18n/ja.json';
import ko from '../../src/i18n/ko.json';

function key(value: string, modifiers: Partial<KeyboardEvent> = {}) {
  return {
    key: value,
    code: '',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    ...modifiers,
  };
}
const commandFor = (
  value: string,
  modifiers: Partial<KeyboardEvent> = {},
  layer: InputLayer = 'edit',
) => keyBinding(key(value, modifiers), layer)?.command;

describe('keyboard bindings', () => {
  it('distinguishes project, clipboard, navigation and snap-bypass modifiers', () => {
    expect(commandFor('s', { ctrlKey: true })).toBe('save-project');
    expect(commandFor('S', { metaKey: true, shiftKey: true })).toBe('export-wos');
    expect(commandFor('s')).toBe('clip-number-up');
    expect(commandFor('s', { altKey: true })).toBeUndefined();
    expect(commandFor('ArrowLeft', { shiftKey: true })).toBe('cursor-left-tick');
    expect(commandFor('Enter', { altKey: true })).toBe('place-marker-free');
    expect(commandFor('Enter')).toBe('place-marker');
    expect(commandFor('+', { shiftKey: true })).toBe('zoom-in');
    expect(commandFor('r')).toBe('open-wheel');
    expect(commandFor('z', { isComposing: true })).toBeUndefined();
    expect(shortcutLabel('save-project')).toBe('Ctrl/Cmd+S');
  });
  it('uses the seven physical letter keys in recording and keeps modifier shortcuts', () => {
    const taps = [...'zsxdcfv'].map(
      (value) => keyBinding(key(value, { code: codeForKey(value) }), 'recording')?.args?.keys,
    );
    expect(taps).toEqual([[1], [2], [3], [4], [5], [6], [7]]);
    // Position, not letter: a layout that puts Y on the Z key still taps key 1.
    expect(keyBinding(key('y', { code: 'KeyZ' }), 'recording')?.args?.keys).toEqual([1]);
    expect(commandFor(' ', { code: 'Space' }, 'recording')).toBe('play-pause');
    expect(commandFor('q', {}, 'recording')).toBe('seek-backward');
    expect(commandFor('t', {}, 'recording')).toBe('seek-forward');
    expect(commandFor('a', {}, 'recording')).toBe('rate-down');
    expect(commandFor('z', { ctrlKey: true }, 'recording')).toBe('undo');
    expect(commandFor('ArrowLeft', {}, 'recording')).toBe('cursor-left-grid');
    expect(shortcutLabel('clip-number-down', true)).toBe('');
    expect(shortcutLabel('clip-number-down')).toBe('A');
    expect(shortcutLabel('import-wos', true)).toBe('');
    expect(shortcutLabel('save-project', true)).toBe('Ctrl/Cmd+S');
    expect(shortcutLabel('rate-down', true)).toBe('A / [');
  });
});

describe('controller bindings', () => {
  it('puts the main edit on A and keeps playback on RT in both layers', () => {
    expect(gamepadBinding('a', 'edit')?.command).toBe('place-marker');
    expect(gamepadBinding('rt', 'edit')?.command).toBe('play-pause');
    expect(gamepadBinding('rt', 'recording')?.command).toBe('play-pause');
    expect(gamepadBinding('lt', 'recording')?.command).toBe('open-wheel');
    expect(gamepadBinding('rs-up', 'recording')?.command).toBe('previous-track');
    expect(gamepadBinding('view', 'recording')?.command).toBe('help');
  });
  it('lets the recording layer hide editing bindings', () => {
    expect(gamepadBinding('a', 'recording')?.args?.keys).toEqual([5]);
    expect(gamepadBinding('dpad-down', 'edit')?.command).toBe('grid-down');
    expect(gamepadBinding('dpad-down', 'recording')).toBeUndefined();
    expect(gamepadBinding('ls-left', 'recording')).toBeUndefined();
    expect(gamepadControls('place-marker', 'recording')).toEqual([]);
    expect(gamepadControls('cursor-left-grid', 'recording')).toEqual([]);
    // The left stick seeks by rotation while recording, so zoom has no controller control there.
    expect(gamepadControls('zoom-in', 'recording')).toEqual([]);
    expect(gamepadControls('zoom-in')).toEqual(['ls-up', 'ls-up-hard']);
    expect(gamepadControls('rate-down', 'recording')).toEqual(['lb']);
  });
  it('maps the YuanCon keys and turntable in order', () => {
    expect(yuanconBinding('key0')?.args?.keys).toEqual([1]);
    expect(yuanconBinding('key6')?.args?.keys).toEqual([7]);
    expect(yuanconBinding('positive')?.command).toBe('play-pause');
    expect(yuanconBinding('negative')?.command).toBe('seek-backward');
  });
  it('has no conflicting controls in a layer and only known commands with translated labels', () => {
    for (const layer of ['edit', 'recording'] as const)
      for (const device of ['keyboard', 'gamepad', 'yuancon'] as const) {
        const seen = new Set<string>();
        for (const binding of BINDINGS.filter((item) => item.layer === layer))
          for (const control of binding[device] ?? []) {
            const id = JSON.stringify(control);
            expect(seen.has(id), `${layer} ${device} ${id}`).toBe(false);
            seen.add(id);
          }
      }
    for (const binding of BINDINGS)
      if (binding.command !== null) expect(isAppCommand(binding.command)).toBe(true);
    for (const locale of ['en', 'zh', 'ja', 'ko']) {
      const { global } = createI18n({ legacy: false, locale, messages: { en, zh, ja, ko } });
      for (const { label } of Object.values(COMMANDS))
        expect(global.t(label), label).not.toBe(label);
    }
  });
});

describe('input routing', () => {
  const press = (control: Parameters<typeof gamepadBinding>[0]) => ({
    control,
    phase: 'press' as const,
  });
  const release = (control: Parameters<typeof gamepadBinding>[0]) => ({
    control,
    phase: 'release' as const,
  });
  it('merges the recording taps of one poll into one chord at the poll time', () => {
    expect(routeGamepad([press('a'), press('dpad-left'), press('rt')], 'recording', 500)).toEqual([
      { kind: 'command', command: 'recording-tap', args: { time: 500, keys: [5, 1] } },
      { kind: 'command', command: 'play-pause' },
    ]);
    expect(routeYuancon(['positive', 'key0', 'key2'], 20)).toEqual([
      { kind: 'command', command: 'recording-tap', args: { time: 20, keys: [1, 3] } },
      { kind: 'command', command: 'play-pause' },
    ]);
  });
  it('sends controller input to the owner of the current context', () => {
    expect(routeGamepad([press('a')], 'edit', 0)).toEqual([
      { kind: 'command', command: 'place-marker' },
    ]);
    expect(routeGamepad([press('menu')], 'edit', 0)).toEqual([{ kind: 'menu', action: 'toggle' }]);
    expect(routeGamepad([press('dpad-left')], 'dialog', 0)).toEqual([
      { kind: 'dialog', action: 'left' },
    ]);
    expect(routeGamepad([press('lb')], 'menu', 0)).toEqual([{ kind: 'menu', action: 'previous' }]);
    expect(routeGamepad([press('x')], 'menu', 0)).toEqual([]);
    expect(routeGamepad([press('a')], 'modal', 0)).toEqual([]);
    // A text field keeps its focus; help and the menu stay reachable.
    expect(routeGamepad([press('a'), press('view')], 'text', 0)).toEqual([
      { kind: 'command', command: 'help' },
    ]);
  });
  it('holds the wheel with its control, steps with the D-pad and points with sticks', () => {
    expect(routeGamepad([press('lt')], 'edit', 0)).toEqual([{ kind: 'wheel', action: 'hold' }]);
    expect(
      routeGamepad(
        [press('dpad-left'), release('dpad-left'), press('rb'), press('a'), release('lt')],
        'wheel',
        0,
      ),
    ).toEqual([
      { kind: 'wheel', action: 'step-left' },
      { kind: 'wheel', action: 'next' },
      { kind: 'wheel', action: 'confirm' },
      { kind: 'wheel', action: 'release' },
    ]);
  });
});
