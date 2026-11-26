import { shallowRef } from 'vue';
import type { AppCommand } from '../app/commands';
import type { GamepadControl } from './gamepad';
import type { YuanconControl } from './yuancon/protocol';
import type { MarkerKey } from '../project/schema';
import { codeForKey, codeLabel, eventCode, type RecordingInput } from './recording';

/**
 * Input layers. Recording lies over editing: a control bound in the recording
 * layer hides its editing binding; every other editing binding stays active.
 */
export type InputLayer = 'edit' | 'recording';

/**
 * A keyboard chord. `key` matches the produced character with exact modifiers.
 * `code` matches the physical key without modifiers; recording keys use it
 * because their positions matter, not their letters.
 */
export interface KeyChord {
  key?: string;
  code?: string;
  primary?: boolean;
  shift?: boolean | 'either';
  alt?: boolean;
}
export interface Binding {
  layer: InputLayer;
  /** `null` reserves the controls in this layer, so they do nothing. */
  command: AppCommand | null;
  args?: RecordingInput;
  keyboard?: readonly KeyChord[];
  gamepad?: readonly GamepadControl[];
  yuancon?: readonly YuanconControl[];
}

const key = (...keys: string[]): KeyChord[] => keys.map((value) => ({ key: value }));
const primary = (value: string, shift = false): KeyChord => ({ key: value, primary: true, shift });
const TAP_KEYS = ['Enter', ',', '.'] as const;
/** Fixed keys outside the binding table: calibration taps and cancelling a drag or dialog. */
export const CALIBRATION_TAP: readonly KeyChord[] = key(...TAP_KEYS);
export const CANCEL: readonly KeyChord[] = key('Escape');

/** Recording keys 1–7 on each device, left to right. */
const RECORDING_KEYS: readonly {
  key: MarkerKey;
  code: string;
  gamepad: GamepadControl;
  yuancon: YuanconControl;
}[] = [
  { key: 1, code: 'KeyZ', gamepad: 'dpad-left', yuancon: 'key0' },
  { key: 2, code: 'KeyS', gamepad: 'dpad-up', yuancon: 'key1' },
  { key: 3, code: 'KeyX', gamepad: 'dpad-right', yuancon: 'key2' },
  { key: 4, code: 'KeyD', gamepad: 'x', yuancon: 'key3' },
  { key: 5, code: 'KeyC', gamepad: 'a', yuancon: 'key4' },
  { key: 6, code: 'KeyF', gamepad: 'y', yuancon: 'key5' },
  { key: 7, code: 'KeyV', gamepad: 'b', yuancon: 'key6' },
];

/**
 * Default bindings. Menus, tooltips, help, the controller hint bar and every
 * input device read this table through the functions below. Help lists the
 * editing commands in this order.
 */
export const BINDINGS: readonly Binding[] = [
  { layer: 'edit', command: 'open-audio', keyboard: [primary('o')] },
  { layer: 'edit', command: 'open-project', keyboard: [primary('o', true)] },
  { layer: 'edit', command: 'save-project', keyboard: [primary('s')] },
  { layer: 'edit', command: 'import-wos', keyboard: key('t') },
  { layer: 'edit', command: 'export-wos', keyboard: [primary('s', true), ...key('y')] },
  { layer: 'edit', command: 'help', keyboard: key('F1'), gamepad: ['view'] },
  { layer: 'edit', command: 'open-wheel', keyboard: key('r'), gamepad: ['lt'] },
  { layer: 'edit', command: 'undo', keyboard: [primary('z')] },
  { layer: 'edit', command: 'redo', keyboard: [primary('z', true), primary('y')] },
  { layer: 'edit', command: 'copy-selection', keyboard: [primary('c')] },
  { layer: 'edit', command: 'cut-selection', keyboard: [primary('x')] },
  { layer: 'edit', command: 'paste-selection', keyboard: [primary('v')] },
  { layer: 'edit', command: 'measure-paste', keyboard: [primary('f')] },
  { layer: 'edit', command: 'select-all', keyboard: [primary('a')] },
  { layer: 'edit', command: 'clear-selection', keyboard: CANCEL, gamepad: ['b'] },
  { layer: 'edit', command: 'clear-markers', keyboard: key('c') },
  { layer: 'edit', command: 'toggle-marker', keyboard: key('z'), gamepad: ['x'] },
  { layer: 'edit', command: 'place-marker', keyboard: CALIBRATION_TAP, gamepad: ['a'] },
  {
    layer: 'edit',
    command: 'place-marker-free',
    keyboard: TAP_KEYS.map((value) => ({ key: value, alt: true })),
  },
  { layer: 'edit', command: 'shift-markers-earlier', keyboard: key('7') },
  { layer: 'edit', command: 'shift-markers-later', keyboard: key('8') },
  { layer: 'edit', command: 'play-pause', keyboard: key(' '), gamepad: ['rt'] },
  { layer: 'edit', command: 'preview', keyboard: key('p'), gamepad: ['y'] },
  { layer: 'edit', command: 'preview-previous', keyboard: key('o') },
  { layer: 'edit', command: 'rate-down', keyboard: key('[') },
  { layer: 'edit', command: 'rate-up', keyboard: key(']') },
  { layer: 'edit', command: 'grid-down', keyboard: key('q'), gamepad: ['dpad-down'] },
  { layer: 'edit', command: 'grid-up', keyboard: key('w'), gamepad: ['dpad-up'] },
  {
    layer: 'edit',
    command: 'zoom-in',
    keyboard: [
      { key: '+', shift: 'either' },
      { key: '=', shift: 'either' },
    ],
    gamepad: ['rs-up'],
  },
  { layer: 'edit', command: 'zoom-out', keyboard: key('-'), gamepad: ['rs-down'] },
  {
    layer: 'edit',
    command: 'cursor-left-grid',
    keyboard: key('ArrowLeft'),
    gamepad: ['dpad-left', 'ls-left'],
  },
  {
    layer: 'edit',
    command: 'cursor-right-grid',
    keyboard: key('ArrowRight'),
    gamepad: ['dpad-right', 'ls-right'],
  },
  {
    layer: 'edit',
    command: 'cursor-left-tick',
    keyboard: [{ key: 'ArrowLeft', shift: true }],
    gamepad: ['rs-left'],
  },
  {
    layer: 'edit',
    command: 'cursor-right-tick',
    keyboard: [{ key: 'ArrowRight', shift: true }],
    gamepad: ['rs-right'],
  },
  {
    layer: 'edit',
    command: 'cursor-previous-measure',
    keyboard: key('ArrowUp'),
    gamepad: ['lb'],
  },
  { layer: 'edit', command: 'cursor-next-measure', keyboard: key('ArrowDown'), gamepad: ['rb'] },
  { layer: 'edit', command: 'previous-track', keyboard: [primary('ArrowUp')] },
  { layer: 'edit', command: 'next-track', keyboard: [primary('ArrowDown')] },
  { layer: 'edit', command: 'export-slice', keyboard: [primary('e')] },
  { layer: 'edit', command: 'export-all', keyboard: [primary('e', true), ...key('m')] },
  { layer: 'edit', command: 'copy-bmse', keyboard: key('v') },
  { layer: 'edit', command: 'paste-bmse', keyboard: key('b') },
  { layer: 'edit', command: 'clip-number-down', keyboard: key('a') },
  { layer: 'edit', command: 'clip-number-up', keyboard: key('s') },
  { layer: 'edit', command: 'toggle-ff', keyboard: key('n') },

  {
    layer: 'recording',
    command: 'play-pause',
    keyboard: [{ code: 'Space' }],
    gamepad: ['rt'],
    yuancon: ['positive'],
  },
  {
    layer: 'recording',
    command: 'seek-backward',
    keyboard: [{ code: 'KeyQ' }],
    gamepad: ['ls-counterclockwise'],
    yuancon: ['negative'],
  },
  {
    layer: 'recording',
    command: 'seek-forward',
    keyboard: [{ code: 'KeyT' }],
    gamepad: ['ls-clockwise'],
  },
  ...RECORDING_KEYS.map((item): Binding => ({
    layer: 'recording',
    command: 'recording-tap',
    args: { keys: [item.key] },
    keyboard: [{ code: item.code }],
    gamepad: [item.gamepad],
    yuancon: [item.yuancon],
  })),
  { layer: 'recording', command: 'rate-down', keyboard: [{ code: 'KeyA' }], gamepad: ['lb'] },
  { layer: 'recording', command: 'rate-up', keyboard: [{ code: 'KeyG' }], gamepad: ['rb'] },
  // D-pad down sits next to key 2; a near miss must not change the grid.
  // The left stick seeks by rotation, so its directions do nothing.
  {
    layer: 'recording',
    command: null,
    gamepad: ['dpad-down', 'ls-up', 'ls-down', 'ls-left', 'ls-right'],
  },
];

/** Stable identity of a binding row: layer, command and, for recording taps, the key. */
export function bindingId(binding: Pick<Binding, 'layer' | 'command' | 'args'>): string {
  const key = binding.args ? '/' + binding.args.keys.join('+') : '';
  return `${binding.layer}/${binding.command ?? '-'}${key}`;
}
/** A user's replacement of a row's keyboard or controller controls. YuanCon keys are fixed. */
export interface BindingOverride {
  keyboard?: readonly KeyChord[];
  gamepad?: readonly GamepadControl[];
}
/** The default table with the user's overrides applied; every lookup below reads it. */
const active = shallowRef<readonly Binding[]>(BINDINGS);
export function applyBindingOverrides(overrides: Readonly<Record<string, BindingOverride>>): void {
  active.value = BINDINGS.map((binding) => {
    const override = overrides[bindingId(binding)];
    return override ? { ...binding, ...override } : binding;
  });
}
export function activeBindings(): readonly Binding[] {
  return active.value;
}

type KeyEvent = Pick<
  KeyboardEvent,
  'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'isComposing'
>;
function keyMatches(chord: KeyChord, event: KeyEvent): boolean {
  if (chord.code !== undefined)
    return (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey &&
      eventCode(event) === chord.code
    );
  return (
    chord.key?.toLowerCase() === event.key.toLowerCase() &&
    Boolean(chord.primary) === (event.ctrlKey || event.metaKey) &&
    Boolean(chord.alt) === event.altKey &&
    (chord.shift === 'either' || Boolean(chord.shift) === event.shiftKey)
  );
}
export function matchesChords(event: KeyEvent, chords: readonly KeyChord[]): boolean {
  if (event.isComposing || event.key === 'Process') return false;
  return chords.some((chord) => keyMatches(chord, event));
}

/** The physical key a chord occupies when it has no modifiers. */
function plainCode(chord: KeyChord): string | undefined {
  if (chord.code !== undefined) return chord.code;
  if (chord.primary || chord.alt || chord.shift === true || chord.key === undefined) return;
  return chord.key.length === 1 ? codeForKey(chord.key) : chord.key;
}
/** Layers to search, topmost first. */
function layers(layer: InputLayer): readonly InputLayer[] {
  return layer === 'recording' ? ['recording', 'edit'] : ['edit'];
}
function find(layer: InputLayer, matches: (binding: Binding) => boolean): Binding | undefined {
  for (const current of layers(layer)) {
    const binding = active.value.find((item) => item.layer === current && matches(item));
    if (binding) return binding.command === null ? undefined : binding;
  }
  return undefined;
}

export function keyBinding(event: KeyEvent, layer: InputLayer): Binding | undefined {
  if (event.isComposing || event.key === 'Process') return undefined;
  return find(layer, (binding) => !!binding.keyboard?.some((chord) => keyMatches(chord, event)));
}
export function gamepadBinding(control: GamepadControl, layer: InputLayer): Binding | undefined {
  return find(layer, (binding) => !!binding.gamepad?.includes(control));
}
export function yuanconBinding(control: YuanconControl): Binding | undefined {
  return find('recording', (binding) => !!binding.yuancon?.includes(control));
}

/** Controls of `command` that act in `layer`: its own bindings and the unhidden ones below. */
function effective<Control>(
  command: AppCommand,
  layer: InputLayer,
  controls: (binding: Binding) => readonly Control[] | undefined,
  occupies: (control: Control) => string | undefined,
): Control[] {
  const result: Control[] = [];
  const taken = new Set<string>();
  for (const current of layers(layer)) {
    const rows = active.value.filter((item) => item.layer === current);
    for (const binding of rows)
      if (binding.command === command)
        for (const control of controls(binding) ?? []) {
          const place = occupies(control);
          if (place === undefined || !taken.has(place)) result.push(control);
        }
    for (const binding of rows)
      for (const control of controls(binding) ?? []) {
        const place = occupies(control);
        if (place !== undefined) taken.add(place);
      }
  }
  return result;
}
export function keyboardChords(command: AppCommand, layer: InputLayer = 'edit'): KeyChord[] {
  return effective(command, layer, (binding) => binding.keyboard, plainCode);
}
export function gamepadControls(command: AppCommand, layer: InputLayer = 'edit'): GamepadControl[] {
  return effective(
    command,
    layer,
    (binding) => binding.gamepad,
    (control) => control,
  );
}
export function yuanconControls(command: AppCommand): YuanconControl[] {
  return effective(
    command,
    'recording',
    (binding) => binding.yuancon,
    (control) => control,
  );
}
/** Recording keys 1–7 and the control of each device, for guides. */
export function recordingKeys(): readonly {
  key: MarkerKey;
  keyboard: string;
  gamepad: GamepadControl;
  yuancon: YuanconControl;
}[] {
  return RECORDING_KEYS.map((item) => ({ ...item, keyboard: codeLabel(item.code) }));
}
/** Commands that have bindings of their own in `layer`, in table order. */
export function boundCommands(layer: InputLayer): AppCommand[] {
  return [
    ...new Set(
      active.value.flatMap((binding) =>
        binding.layer === layer && binding.command ? [binding.command] : [],
      ),
    ),
  ];
}

const KEY_LABELS: Readonly<Record<string, string>> = {
  ' ': 'Space',
  Escape: 'Esc',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
};
function keyLabel(chord: KeyChord): string {
  if (chord.code !== undefined) return codeLabel(chord.code);
  const value = chord.key ?? '';
  return KEY_LABELS[value] ?? (value.length === 1 ? value.toUpperCase() : value);
}
export function formatChords(chords: readonly KeyChord[]): string {
  const labels = chords.map((chord) =>
    [
      ...(chord.primary ? ['Ctrl/Cmd'] : []),
      ...(chord.alt ? ['Alt'] : []),
      ...(chord.shift === true ? ['Shift'] : []),
      keyLabel(chord),
    ].join('+'),
  );
  return [...new Set(labels)].join(' / ');
}
/** The keyboard text shown beside a command in menus and tooltips. */
export function shortcutLabel(command: AppCommand, recording = false): string {
  return formatChords(keyboardChords(command, recording ? 'recording' : 'edit'));
}
/** The first controller control of a command, for menus. */
export function gamepadShortcut(
  command: AppCommand,
  recording = false,
): GamepadControl | undefined {
  return gamepadControls(command, recording ? 'recording' : 'edit')[0];
}
