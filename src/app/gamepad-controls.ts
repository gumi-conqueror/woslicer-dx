/** Standard Gamepad API layout, displayed with Xbox button symbols. */
export const GAMEPAD_CONTROLS = [
  { id: 'menu', button: 9, label: 'Menu' },
  { id: 'view', button: 8, label: 'View' },
  { id: 'a', button: 0, label: 'A' },
  { id: 'b', button: 1, label: 'B' },
  { id: 'x', button: 2, label: 'X' },
  { id: 'y', button: 3, label: 'Y' },
  { id: 'lb', button: 4, label: 'LB' },
  { id: 'rb', button: 5, label: 'RB' },
  { id: 'lt', button: 6, label: 'LT' },
  { id: 'rt', button: 7, label: 'RT' },
  { id: 'up', button: 12, label: 'D-pad ↑ / LS ↑' },
  { id: 'down', button: 13, label: 'D-pad ↓ / LS ↓' },
  { id: 'left', button: 14, label: 'D-pad ← / LS ←' },
  { id: 'right', button: 15, label: 'D-pad → / LS →' },
] as const;
export const GAMEPAD_ROTATIONS = [
  { id: 'ls-counterclockwise', label: 'LS ↺' },
  { id: 'ls-clockwise', label: 'LS ↻' },
] as const;
export type GamepadControl =
  | (typeof GAMEPAD_CONTROLS)[number]['id']
  | (typeof GAMEPAD_ROTATIONS)[number]['id'];
export type MenuNavigation = 'toggle' | 'confirm' | 'cancel' | 'up' | 'down' | 'left' | 'right';
export const GAMEPAD_MENU_SHORTCUTS: readonly {
  control: GamepadControl;
  action: MenuNavigation;
  label: string;
}[] = [
  { control: 'menu', action: 'toggle', label: 'input.menuMode' },
  { control: 'a', action: 'confirm', label: 'input.confirm' },
  { control: 'b', action: 'cancel', label: 'input.back' },
  { control: 'left', action: 'left', label: 'input.previousMenu' },
  { control: 'right', action: 'right', label: 'input.nextMenu' },
  { control: 'up', action: 'up', label: 'input.previousItem' },
  { control: 'down', action: 'down', label: 'input.nextItem' },
];
export function gamepadNavigation(control: GamepadControl): MenuNavigation | undefined {
  return GAMEPAD_MENU_SHORTCUTS.find((item) => item.control === control)?.action;
}

/** Edge-trigger actions; only navigation and zoom repeat while held. */
export function createGamepadReader() {
  const held = new Map<GamepadControl, number>();
  let index: number | undefined;
  let suspended = false;
  let recording = false;
  let angle: number | undefined;
  let rotation = 0;
  return (
    pad: Pick<Gamepad, 'index' | 'buttons' | 'axes'> | undefined,
    now: number,
    enabled: boolean,
    recordingMode = false,
  ): GamepadControl[] => {
    if (pad?.index !== index || recordingMode !== recording) {
      held.clear();
      angle = undefined;
      rotation = 0;
    }
    if (recordingMode !== recording) suspended = true;
    recording = recordingMode;
    index = pad?.index;
    if (!enabled) suspended = true;
    const pressed = new Set<GamepadControl>();
    if (pad) {
      for (const control of GAMEPAD_CONTROLS) {
        const button = pad.buttons[control.button];
        if (
          button &&
          (control.id === 'lt' || control.id === 'rt' ? button.value > 0.55 : button.pressed)
        )
          pressed.add(control.id);
      }
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;
      // A generous dead zone avoids stick drift. The dominant axis avoids diagonal double steps.
      if (!recording) {
        if (Math.abs(x) > 0.55 && Math.abs(x) >= Math.abs(y)) pressed.add(x < 0 ? 'left' : 'right');
        else if (Math.abs(y) > 0.55) pressed.add(y < 0 ? 'up' : 'down');
      }
    }
    const x = pad?.axes[0] ?? 0;
    const y = pad?.axes[1] ?? 0;
    if (pressed.size === 0 && Math.hypot(x, y) <= 0.55 && enabled) suspended = false;
    const actions: GamepadControl[] = [];
    for (const control of GAMEPAD_CONTROLS) {
      if (!pressed.has(control.id)) {
        held.delete(control.id);
        continue;
      }
      const next = held.get(control.id);
      if (!enabled || suspended) {
        held.set(control.id, Infinity);
        continue;
      }
      const repeat = !recording && ['up', 'down', 'left', 'right', 'lt', 'rt'].includes(control.id);
      if (next === undefined || (repeat && now >= next)) {
        actions.push(control.id);
        held.set(control.id, now + (next === undefined ? 380 : 110));
      }
    }
    if (recording && enabled && !suspended && Math.hypot(x, y) > 0.55) {
      const current = Math.atan2(y, x);
      if (angle !== undefined) {
        const delta = Math.atan2(Math.sin(current - angle), Math.cos(current - angle));
        // Large jumps have an ambiguous direction; reacquire instead of seeking.
        if (Math.abs(delta) > Math.PI / 2 + 0.001) rotation = 0;
        else {
          rotation += delta;
          const step = Math.PI / 4;
          while (Math.abs(rotation) >= step - 0.000001) {
            const clockwise = rotation > 0;
            actions.push(clockwise ? 'ls-clockwise' : 'ls-counterclockwise');
            rotation -= clockwise ? step : -step;
          }
        }
      }
      angle = current;
    } else {
      angle = undefined;
      rotation = 0;
    }
    return actions;
  };
}
