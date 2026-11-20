import type { AppCommand } from './command-types';

interface KeyBinding {
  keys: readonly string[];
  primary?: boolean;
  shift?: boolean | 'either';
  alt?: boolean;
}
interface Shortcut {
  command: AppCommand;
  label: string;
  group: 'project' | 'edit' | 'playback' | 'navigation' | 'output';
  bindings: readonly KeyBinding[];
}
const key = (...keys: string[]): KeyBinding => ({ keys });
const primary = (key: string, shift = false): KeyBinding => ({ keys: [key], primary: true, shift });

const TAP_KEYS = ['Enter', ',', '.'] as const;
export const CALIBRATION_TAP: readonly KeyBinding[] = [key(...TAP_KEYS)];
export const CANCEL: readonly KeyBinding[] = [key('Escape')];

/** The dispatcher, menu hints, tooltips and help all read these bindings. */
export const SHORTCUTS: readonly Shortcut[] = [
  { command: 'open-audio', label: 'menu.openAudio', group: 'project', bindings: [primary('o')] },
  {
    command: 'open-project',
    label: 'menu.openProject',
    group: 'project',
    bindings: [primary('o', true)],
  },
  {
    command: 'save-project',
    label: 'menu.saveProject',
    group: 'project',
    bindings: [primary('s')],
  },
  { command: 'import-wos', label: 'menu.importWos', group: 'project', bindings: [key('t')] },
  {
    command: 'export-wos',
    label: 'menu.exportWos',
    group: 'project',
    bindings: [primary('s', true), key('y')],
  },
  { command: 'help', label: 'menu.guide', group: 'project', bindings: [key('F1')] },
  { command: 'undo', label: 'menu.undo', group: 'edit', bindings: [primary('z')] },
  {
    command: 'redo',
    label: 'menu.redo',
    group: 'edit',
    bindings: [primary('z', true), primary('y')],
  },
  { command: 'select-copy', label: 'menu.copySelection', group: 'edit', bindings: [primary('c')] },
  { command: 'select-cut', label: 'menu.cutSelection', group: 'edit', bindings: [primary('x')] },
  {
    command: 'select-paste',
    label: 'menu.pasteSelection',
    group: 'edit',
    bindings: [primary('v')],
  },
  { command: 'measure-paste', label: 'help.measurePaste', group: 'edit', bindings: [primary('f')] },
  { command: 'select-all', label: 'menu.selectAll', group: 'edit', bindings: [primary('a')] },
  { command: 'clear-selection', label: 'help.clearSelection', group: 'edit', bindings: CANCEL },
  { command: 'clear-markers', label: 'menu.clearMarkers', group: 'edit', bindings: [key('c')] },
  { command: 'toggle-marker', label: 'help.toggleMarker', group: 'edit', bindings: [key('z')] },
  {
    command: 'place-breakpoint',
    label: 'help.placeBreakpoint',
    group: 'edit',
    bindings: CALIBRATION_TAP,
  },
  {
    command: 'place-breakpoint-free',
    label: 'help.placeBreakpointFree',
    group: 'edit',
    bindings: [{ keys: TAP_KEYS, alt: true }],
  },
  { command: 'shift-all-minus', label: 'help.shiftAllMinus', group: 'edit', bindings: [key('7')] },
  { command: 'shift-all-plus', label: 'help.shiftAllPlus', group: 'edit', bindings: [key('8')] },
  { command: 'play-pause', label: 'help.playPause', group: 'playback', bindings: [key(' ')] },
  { command: 'preview', label: 'help.preview', group: 'playback', bindings: [key('p')] },
  {
    command: 'preview-previous',
    label: 'help.previewPrevious',
    group: 'playback',
    bindings: [key('o')],
  },
  { command: 'rate-down', label: 'help.rateDown', group: 'playback', bindings: [key('[')] },
  { command: 'rate-up', label: 'help.rateUp', group: 'playback', bindings: [key(']')] },
  { command: 'grid-down', label: 'help.gridDown', group: 'navigation', bindings: [key('q')] },
  { command: 'grid-up', label: 'help.gridUp', group: 'navigation', bindings: [key('w')] },
  {
    command: 'zoom-in',
    label: 'menu.zoomIn',
    group: 'navigation',
    bindings: [{ keys: ['+', '='], shift: 'either' }],
  },
  { command: 'zoom-out', label: 'menu.zoomOut', group: 'navigation', bindings: [key('-')] },
  {
    command: 'cursor-left-grid',
    label: 'help.cursorLeftGrid',
    group: 'navigation',
    bindings: [key('ArrowLeft')],
  },
  {
    command: 'cursor-right-grid',
    label: 'help.cursorRightGrid',
    group: 'navigation',
    bindings: [key('ArrowRight')],
  },
  {
    command: 'cursor-left-tick',
    label: 'help.cursorLeftTick',
    group: 'navigation',
    bindings: [{ keys: ['ArrowLeft'], shift: true }],
  },
  {
    command: 'cursor-right-tick',
    label: 'help.cursorRightTick',
    group: 'navigation',
    bindings: [{ keys: ['ArrowRight'], shift: true }],
  },
  {
    command: 'cursor-up-measure',
    label: 'help.cursorUpMeasure',
    group: 'navigation',
    bindings: [key('ArrowUp')],
  },
  {
    command: 'cursor-down-measure',
    label: 'help.cursorDownMeasure',
    group: 'navigation',
    bindings: [key('ArrowDown')],
  },
  { command: 'export-slice', label: 'menu.exportSlice', group: 'output', bindings: [primary('e')] },
  {
    command: 'export-all',
    label: 'menu.exportAll',
    group: 'output',
    bindings: [primary('e', true), key('m')],
  },
  { command: 'bmse-out', label: 'help.bmseOut', group: 'output', bindings: [key('v')] },
  { command: 'bmse-in', label: 'help.bmseIn', group: 'output', bindings: [key('b')] },
  {
    command: 'clip-number-down',
    label: 'help.clipNumberDown',
    group: 'output',
    bindings: [key('a')],
  },
  { command: 'clip-number-up', label: 'help.clipNumberUp', group: 'output', bindings: [key('s')] },
  { command: 'toggle-ff', label: 'help.toggleFf', group: 'output', bindings: [key('n')] },
];

export function matchesBindings(event: KeyboardEvent, bindings: readonly KeyBinding[]): boolean {
  if (event.isComposing || event.key === 'Process') return false;
  return bindings.some(
    (binding) =>
      binding.keys.some((key) => key.toLowerCase() === event.key.toLowerCase()) &&
      Boolean(binding.primary) === (event.ctrlKey || event.metaKey) &&
      Boolean(binding.alt) === event.altKey &&
      (binding.shift === 'either' || Boolean(binding.shift) === event.shiftKey),
  );
}
export function commandForKey(event: KeyboardEvent): AppCommand | undefined {
  return SHORTCUTS.find((shortcut) => matchesBindings(event, shortcut.bindings))?.command;
}
const KEY_LABELS: Readonly<Record<string, string>> = {
  ' ': 'Space',
  Escape: 'Esc',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
};
export function formatBindings(bindings: readonly KeyBinding[]): string {
  return bindings
    .flatMap((binding) =>
      binding.keys.map((key) =>
        [
          ...(binding.primary ? ['Ctrl/Cmd'] : []),
          ...(binding.alt ? ['Alt'] : []),
          ...(binding.shift === true ? ['Shift'] : []),
          KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key),
        ].join('+'),
      ),
    )
    .join(' / ');
}
export function shortcutLabel(command: AppCommand): string {
  return formatBindings(SHORTCUTS.find((shortcut) => shortcut.command === command)?.bindings ?? []);
}
