import type { AppCommand } from '../app/commands';
import { gamepadBinding, yuanconBinding, type InputLayer } from './bindings';
import { uiNavigation, type GamepadControl, type GamepadEvent, type UiNavigation } from './gamepad';
import { mergeTaps, type RecordingInput } from './recording';
import type { YuanconControl } from './yuancon/protocol';

/**
 * Where application input goes, from the most to the least exclusive owner.
 * `dialog` is any visible dialog; `modal` is an app lock without a visible
 * dialog; `text` is focus in an editable control.
 */
export type InputContext = 'dialog' | 'modal' | 'wheel' | 'menu' | 'text' | InputLayer;
export type WheelAction = 'hold' | 'release' | 'confirm' | 'cancel' | 'previous' | 'next';
export type InputAction =
  | { kind: 'dialog'; action: UiNavigation }
  | { kind: 'menu'; action: UiNavigation }
  | { kind: 'wheel'; action: WheelAction }
  | { kind: 'command'; command: AppCommand; args?: RecordingInput };

/** Commands that stay available while a text field has focus. */
const TEXT_COMMANDS: readonly AppCommand[] = ['help'];
/** Directions point inside the wheel, so only these buttons act on it. */
const WHEEL_ACTIONS: Partial<Record<GamepadControl, WheelAction>> = {
  a: 'confirm',
  b: 'cancel',
  lb: 'previous',
  rb: 'next',
};

/** Merges the recording taps of one poll into a single chord at the poll time. */
function commandActions(
  bindings: readonly { command: AppCommand; args?: RecordingInput }[],
  time: number,
): InputAction[] {
  const taps: RecordingInput[] = [];
  const actions: InputAction[] = [];
  for (const { command, args } of bindings) {
    if (command === 'recording-tap' && args) taps.push({ time, keys: args.keys });
    else actions.push({ kind: 'command', command });
  }
  const tap = mergeTaps(taps);
  return tap ? [{ kind: 'command', command: 'recording-tap', args: tap }, ...actions] : actions;
}

/** Controller events of one poll, in the given context, become app actions. */
export function routeGamepad(
  events: readonly GamepadEvent[],
  context: InputContext,
  time: number,
): InputAction[] {
  if (context === 'modal') return [];
  const actions: InputAction[] = [];
  const bound: { command: AppCommand; args?: RecordingInput }[] = [];
  for (const { control, phase } of events) {
    if (context === 'wheel') {
      const holds = gamepadBinding(control, 'edit')?.command === 'open-wheel';
      const action =
        phase === 'release'
          ? holds
            ? 'release'
            : undefined
          : phase === 'press'
            ? holds
              ? 'hold'
              : WHEEL_ACTIONS[control]
            : undefined;
      if (action) actions.push({ kind: 'wheel', action });
      continue;
    }
    if (phase === 'release') continue;
    if (context === 'dialog' || context === 'menu') {
      const action = uiNavigation(control, context === 'dialog');
      if (action) actions.push({ kind: context, action });
      continue;
    }
    if (phase === 'press' && uiNavigation(control) === 'toggle') {
      actions.push({ kind: 'menu', action: 'toggle' });
      continue;
    }
    const binding = gamepadBinding(control, context === 'text' ? 'edit' : context);
    if (!binding?.command) continue;
    if (context === 'text' && !TEXT_COMMANDS.includes(binding.command)) continue;
    if (binding.command === 'open-wheel') {
      if (phase === 'press') actions.push({ kind: 'wheel', action: 'hold' });
      continue;
    }
    bound.push({ command: binding.command, args: binding.args });
  }
  return [...actions, ...commandActions(bound, time)];
}

/** YuanCon controls of one report; YuanCon only acts in recording mode. */
export function routeYuancon(controls: readonly YuanconControl[], time: number): InputAction[] {
  return commandActions(
    controls.flatMap((control) => {
      const binding = yuanconBinding(control);
      return binding?.command ? [{ command: binding.command, args: binding.args }] : [];
    }),
    time,
  );
}
