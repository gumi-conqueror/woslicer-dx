import type { AppCommand } from './command-types';
import type { GamepadControl } from './gamepad-controls';
import type { YuanconControl, YuanconGuideControl } from '../input/yuancon/protocol';
import type { MarkerKey } from '../project/schema';

export interface RecordingInput {
  time?: number;
  keys: readonly MarkerKey[];
}
export const RECORDING_KEYS: readonly {
  key: MarkerKey;
  keyboard: string;
  gamepad: GamepadControl;
  yuancon: YuanconControl;
}[] = [
  { key: 1, keyboard: 'KeyZ', gamepad: 'left', yuancon: 'key0' },
  { key: 2, keyboard: 'KeyS', gamepad: 'up', yuancon: 'key1' },
  { key: 3, keyboard: 'KeyX', gamepad: 'right', yuancon: 'key2' },
  { key: 4, keyboard: 'KeyD', gamepad: 'x', yuancon: 'key3' },
  { key: 5, keyboard: 'KeyC', gamepad: 'a', yuancon: 'key4' },
  { key: 6, keyboard: 'KeyF', gamepad: 'y', yuancon: 'key5' },
  { key: 7, keyboard: 'KeyV', gamepad: 'b', yuancon: 'key6' },
];

export const RECORDING_SEEK_SECONDS = 0.5;
export const RECORDING_BINDINGS: readonly {
  command: AppCommand;
  label: string;
  keyboard: readonly string[];
  gamepad: readonly GamepadControl[];
  yuancon: readonly YuanconGuideControl[];
}[] = [
  {
    command: 'play-pause',
    label: 'help.playPause',
    keyboard: ['Space'],
    gamepad: ['rt'],
    yuancon: ['positive'],
  },
  {
    command: 'seek-backward',
    label: 'recording.backward',
    keyboard: ['KeyQ'],
    gamepad: ['ls-counterclockwise'],
    yuancon: ['negative'],
  },
  {
    command: 'seek-forward',
    label: 'recording.forward',
    keyboard: ['KeyT'],
    gamepad: ['ls-clockwise'],
    yuancon: [],
  },
  {
    command: 'recording-tap',
    label: 'recording.tap',
    keyboard: RECORDING_KEYS.map((binding) => binding.keyboard),
    gamepad: RECORDING_KEYS.map((binding) => binding.gamepad),
    yuancon: ['keys'],
  },
  {
    command: 'rate-down',
    label: 'help.rateDown',
    keyboard: ['KeyA'],
    gamepad: ['lb'],
    yuancon: [],
  },
  { command: 'rate-up', label: 'help.rateUp', keyboard: ['KeyG'], gamepad: ['rb'], yuancon: [] },
];

export function recordingCommandForKey(event: KeyboardEvent): AppCommand | undefined {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  const code = event.code || (event.key === ' ' ? 'Space' : `Key${event.key.toUpperCase()}`);
  return RECORDING_BINDINGS.find((binding) => binding.keyboard.includes(code))?.command;
}

export function recordingCommandForGamepad(control: GamepadControl): AppCommand | undefined {
  return RECORDING_BINDINGS.find((binding) => binding.gamepad.includes(control))?.command;
}

export function recordingCommandForYuancon(control: YuanconControl): AppCommand | undefined {
  const group = control === 'positive' || control === 'negative' ? control : 'keys';
  return RECORDING_BINDINGS.find((binding) => binding.yuancon.includes(group))?.command;
}
