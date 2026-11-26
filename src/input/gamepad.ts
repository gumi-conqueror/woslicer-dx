/** Standard Gamepad API layout, displayed with Xbox button symbols. */
export const GAMEPAD_BUTTONS = [
  { id: 'a', button: 0, label: 'A' },
  { id: 'b', button: 1, label: 'B' },
  { id: 'x', button: 2, label: 'X' },
  { id: 'y', button: 3, label: 'Y' },
  { id: 'lb', button: 4, label: 'LB' },
  { id: 'rb', button: 5, label: 'RB' },
  { id: 'lt', button: 6, label: 'LT' },
  { id: 'rt', button: 7, label: 'RT' },
  { id: 'view', button: 8, label: 'View' },
  { id: 'menu', button: 9, label: 'Menu' },
  { id: 'ls', button: 10, label: 'LS' },
  { id: 'rs', button: 11, label: 'RS' },
  { id: 'dpad-up', button: 12, label: 'D-pad ↑' },
  { id: 'dpad-down', button: 13, label: 'D-pad ↓' },
  { id: 'dpad-left', button: 14, label: 'D-pad ←' },
  { id: 'dpad-right', button: 15, label: 'D-pad →' },
] as const;
/** Stick directions. Axes 0–1 are the left stick, 2–3 the right stick; up and left are negative. */
export const GAMEPAD_STICK_DIRECTIONS = [
  { id: 'ls-up', axis: 1, sign: -1, label: 'LS ↑' },
  { id: 'ls-down', axis: 1, sign: 1, label: 'LS ↓' },
  { id: 'ls-left', axis: 0, sign: -1, label: 'LS ←' },
  { id: 'ls-right', axis: 0, sign: 1, label: 'LS →' },
  { id: 'rs-up', axis: 3, sign: -1, label: 'RS ↑' },
  { id: 'rs-down', axis: 3, sign: 1, label: 'RS ↓' },
  { id: 'rs-left', axis: 2, sign: -1, label: 'RS ←' },
  { id: 'rs-right', axis: 2, sign: 1, label: 'RS →' },
] as const;
export const GAMEPAD_ROTATIONS = [
  { id: 'ls-counterclockwise', label: 'LS ↺' },
  { id: 'ls-clockwise', label: 'LS ↻' },
] as const;
type HeldControl =
  | (typeof GAMEPAD_BUTTONS)[number]['id']
  | (typeof GAMEPAD_STICK_DIRECTIONS)[number]['id'];
export type GamepadControl = HeldControl | (typeof GAMEPAD_ROTATIONS)[number]['id'];
export const GAMEPAD_CONTROLS: readonly { id: GamepadControl; label: string }[] = [
  ...GAMEPAD_BUTTONS,
  ...GAMEPAD_STICK_DIRECTIONS,
  ...GAMEPAD_ROTATIONS,
];
export interface GamepadEvent {
  control: GamepadControl;
  phase: 'press' | 'repeat' | 'release';
}

/**
 * Fixed navigation for the application menu, dialogs and the command wheel.
 * Users cannot rebind it, so these controls always reach every menu and dialog.
 */
export type UiNavigation =
  | 'toggle'
  | 'confirm'
  | 'cancel'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'previous'
  | 'next'
  | 'scroll-up'
  | 'scroll-down';
export const UI_NAVIGATION: readonly {
  action: UiNavigation;
  controls: readonly GamepadControl[];
  label: string;
}[] = [
  { action: 'toggle', controls: ['menu'], label: 'input.menuMode' },
  { action: 'confirm', controls: ['a'], label: 'input.confirm' },
  { action: 'cancel', controls: ['b'], label: 'input.back' },
  { action: 'previous', controls: ['lb', 'dpad-left', 'ls-left'], label: 'input.previousMenu' },
  { action: 'next', controls: ['rb', 'dpad-right', 'ls-right'], label: 'input.nextMenu' },
  { action: 'up', controls: ['dpad-up', 'ls-up'], label: 'input.previousItem' },
  { action: 'down', controls: ['dpad-down', 'ls-down'], label: 'input.nextItem' },
  { action: 'scroll-up', controls: ['lt'], label: 'input.scrollUp' },
  { action: 'scroll-down', controls: ['rt'], label: 'input.scrollDown' },
];
/** Directions inside dialogs; menu-bar movement treats left and right as previous and next. */
const DIRECTIONS: Partial<Record<GamepadControl, UiNavigation>> = {
  'dpad-left': 'left',
  'ls-left': 'left',
  'dpad-right': 'right',
  'ls-right': 'right',
};
export function uiNavigation(control: GamepadControl, dialog = false): UiNavigation | undefined {
  if (dialog && DIRECTIONS[control]) return DIRECTIONS[control];
  return UI_NAVIGATION.find((item) => item.controls.includes(control))?.action;
}

/** Stick travel that counts as a press. It is generous to ignore stick drift. */
export const GAMEPAD_DEAD_ZONE = 0.55;
/**
 * Trigger travel that counts as a press: a light touch, so controllers with
 * trigger stops work. A held trigger releases below the lower value, so a
 * finger resting at the threshold does not repeat presses.
 */
export const TRIGGER_PRESS = 0.12;
const TRIGGER_RELEASE = 0.06;
/** A held direction or shoulder button repeats after this delay, then at this interval. */
const REPEAT_DELAY_MS = 380;
const REPEAT_INTERVAL_MS = 110;
/** A fully deflected stick repeats at this interval. */
const REPEAT_FASTEST_MS = 40;
/** In recording mode, each eighth of a stick circle seeks one step. */
const ROTATION_STEP = Math.PI / 4;
/** A larger jump between polls has no clear direction; the reader starts over. */
const ROTATION_JUMP = Math.PI / 2 + 0.001;
const REPEATING = new Set<GamepadControl>([
  'dpad-up',
  'dpad-down',
  'dpad-left',
  'dpad-right',
  'lb',
  'rb',
  ...GAMEPAD_STICK_DIRECTIONS.map((item) => item.id),
]);

type Pad = Pick<Gamepad, 'buttons' | 'axes'>;
function axes(pad: Pad | undefined, first: number): { x: number; y: number } {
  return { x: pad?.axes[first] ?? 0, y: pad?.axes[first + 1] ?? 0 };
}

export interface Pointing {
  x: number;
  y: number;
  /** The control that points, or `null` when every control is neutral. */
  from: 'stick' | 'dpad' | null;
}
/**
 * Pointing direction for the command wheel: the right stick, else the left
 * stick, else the D-pad. Screen coordinates: x right, y down. A stick returning
 * toward its center still points, with decreasing travel.
 */
export function pointingVector(pad: Pad | undefined): Pointing {
  for (const first of [2, 0]) {
    const stick = axes(pad, first);
    if (Math.hypot(stick.x, stick.y) > GAMEPAD_DEAD_ZONE / 2) return { ...stick, from: 'stick' };
  }
  const pressed = (button: number) => (pad?.buttons[button]?.pressed ? 1 : 0);
  const x = pressed(15) - pressed(14),
    y = pressed(13) - pressed(12);
  return { x, y, from: x || y ? 'dpad' : null };
}

/** Edge-trigger presses and releases; directions and shoulder buttons repeat while held. */
export function createGamepadReader() {
  /** The next repeat time of each accepted control; Infinity marks a press made while suspended. */
  const held = new Map<HeldControl, number>();
  let index: number | undefined;
  let suspended = false;
  let recording = false;
  let angle: number | undefined;
  let rotation = 0;

  /** Pressed buttons and stick directions, each with its travel from 0 to 1. */
  function pressedControls(pad: Pad | undefined): Map<HeldControl, number> {
    const pressed = new Map<HeldControl, number>();
    if (!pad) return pressed;
    for (const control of GAMEPAD_BUTTONS) {
      const button = pad.buttons[control.button];
      if (!button) continue;
      const analog = control.id === 'lt' || control.id === 'rt';
      const threshold = held.has(control.id) ? TRIGGER_RELEASE : TRIGGER_PRESS;
      if (analog ? button.value > threshold : button.pressed) pressed.set(control.id, 1);
    }
    // The dominant axis of each stick avoids diagonal double steps.
    // In recording mode the left stick seeks by rotation instead.
    for (const [first, prefix] of [
      [0, 'ls'],
      [2, 'rs'],
    ] as const) {
      if (recording && prefix === 'ls') continue;
      const { x, y } = axes(pad, first);
      const horizontal = Math.abs(x) >= Math.abs(y);
      const value = horizontal ? x : y;
      if (Math.abs(value) <= GAMEPAD_DEAD_ZONE) continue;
      const direction = horizontal ? (value < 0 ? 'left' : 'right') : value < 0 ? 'up' : 'down';
      pressed.set(`${prefix}-${direction}`, Math.min(1, Math.abs(value)));
    }
    return pressed;
  }

  /** A stick repeats faster the further it is pushed. */
  function repeatInterval(control: HeldControl, travel: number): number {
    if (!control.startsWith('ls-') && !control.startsWith('rs-')) return REPEAT_INTERVAL_MS;
    const share = (travel - GAMEPAD_DEAD_ZONE) / (1 - GAMEPAD_DEAD_ZONE);
    return REPEAT_INTERVAL_MS - share * (REPEAT_INTERVAL_MS - REPEAT_FASTEST_MS);
  }

  /** Presses, repeats and releases of buttons and stick directions. */
  function heldEvents(
    pressed: Map<HeldControl, number>,
    now: number,
    enabled: boolean,
  ): GamepadEvent[] {
    const events: GamepadEvent[] = [];
    for (const [control, next] of held)
      if (!pressed.has(control)) {
        held.delete(control);
        if (next !== Infinity) events.push({ control, phase: 'release' });
      }
    for (const [control, travel] of pressed) {
      const next = held.get(control);
      if (!enabled || suspended) {
        held.set(control, Infinity);
        continue;
      }
      if (next === undefined) {
        events.push({ control, phase: 'press' });
        held.set(control, now + REPEAT_DELAY_MS);
      } else if (!recording && REPEATING.has(control) && now >= next) {
        events.push({ control, phase: 'repeat' });
        held.set(control, now + repeatInterval(control, travel));
      }
    }
    return events;
  }

  /** Seek steps from circular left-stick motion in recording mode. */
  function rotationEvents(x: number, y: number, enabled: boolean): GamepadEvent[] {
    if (!recording || !enabled || suspended || Math.hypot(x, y) <= GAMEPAD_DEAD_ZONE) {
      angle = undefined;
      rotation = 0;
      return [];
    }
    const events: GamepadEvent[] = [];
    const current = Math.atan2(y, x);
    if (angle !== undefined) {
      const delta = Math.atan2(Math.sin(current - angle), Math.cos(current - angle));
      if (Math.abs(delta) > ROTATION_JUMP) rotation = 0;
      else {
        rotation += delta;
        while (Math.abs(rotation) >= ROTATION_STEP - 0.000001) {
          const clockwise = rotation > 0;
          events.push({
            control: clockwise ? 'ls-clockwise' : 'ls-counterclockwise',
            phase: 'press',
          });
          rotation -= clockwise ? ROTATION_STEP : -ROTATION_STEP;
        }
      }
    }
    angle = current;
    return events;
  }

  return (
    pad: Pick<Gamepad, 'index' | 'buttons' | 'axes'> | undefined,
    now: number,
    enabled: boolean,
    recordingMode = false,
  ): GamepadEvent[] => {
    if (pad?.index !== index || recordingMode !== recording) {
      held.clear();
      angle = undefined;
      rotation = 0;
    }
    if (recordingMode !== recording) suspended = true;
    recording = recordingMode;
    index = pad?.index;
    if (!enabled) suspended = true;
    const pressed = pressedControls(pad);
    const { x, y } = axes(pad, 0);
    // After focus loss or a mode change, input resumes once every control is neutral.
    if (pressed.size === 0 && Math.hypot(x, y) <= GAMEPAD_DEAD_ZONE && enabled) suspended = false;
    return [...heldEvents(pressed, now, enabled), ...rotationEvents(x, y, enabled)];
  };
}
