import { onMounted, onUnmounted } from 'vue';
import { createGamepadReader, type GamepadControl } from './gamepad-controls';
import { useInputState } from './input-state';
import { RECORDING_KEYS, type RecordingInput } from './recording-bindings';

export function useInputControls(
  onControl: (control: GamepadControl, input?: RecordingInput) => void,
  recordingActive: () => boolean = () => false,
): void {
  const input = useInputState();
  const read = createGamepadReader();
  let frame = 0;
  let lastActivity = '';
  let previousPointer: { x: number; y: number } | undefined;
  function keyboard(event: Event): void {
    if (event.isTrusted) input.device = 'keyboard';
  }
  function pointer(event: PointerEvent): void {
    if (!event.isTrusted) return;
    if (
      !previousPointer ||
      Math.hypot(event.clientX - previousPointer.x, event.clientY - previousPointer.y) >= 3
    ) {
      keyboard(event);
      previousPointer = { x: event.clientX, y: event.clientY };
    }
  }
  function poll(now: number): void {
    const pads = navigator.getGamepads?.() ?? [];
    const pad =
      Array.from(pads).find((pad) => pad?.connected && pad.mapping === 'standard') ?? undefined;
    const enabled = !document.hidden && document.hasFocus();
    const activity = pad
      ? [
          ...pad.buttons.map((button) => (button.value > 0.55 ? 1 : 0)),
          ...pad.axes.map((axis) => (Math.abs(axis) > 0.55 ? Math.sign(axis) : 0)),
        ].join(',')
      : '';
    if (enabled && activity !== lastActivity && /1/.test(activity)) input.device = 'gamepad';
    lastActivity = activity;
    const recording = recordingActive();
    const actions = read(pad, now, enabled, recording);
    if (!pad && input.device === 'gamepad') input.device = 'keyboard';
    if (actions.length) {
      input.device = 'gamepad';
      const taps = recording
        ? RECORDING_KEYS.filter((binding) => actions.includes(binding.gamepad))
        : [];
      let tapped = false;
      for (const action of actions) {
        if (taps.some((binding) => binding.gamepad === action)) {
          if (!tapped) onControl(action, { time: now, keys: taps.map((binding) => binding.key) });
          tapped = true;
        } else onControl(action);
      }
    }
    frame = requestAnimationFrame(poll);
  }
  function suspend(): void {
    read(undefined, performance.now(), false);
  }
  onMounted(() => {
    frame = requestAnimationFrame(poll);
    // Capture before the menu consumes keyboard events. Synthetic dialog keys
    // from the controller must not switch the displayed input device.
    window.addEventListener('keydown', keyboard, true);
    window.addEventListener('pointerdown', keyboard, true);
    window.addEventListener('wheel', keyboard, { passive: true, capture: true });
    window.addEventListener('pointermove', pointer, { passive: true });
    window.addEventListener('blur', suspend);
  });
  onUnmounted(() => {
    cancelAnimationFrame(frame);
    window.removeEventListener('keydown', keyboard, true);
    window.removeEventListener('pointerdown', keyboard, true);
    window.removeEventListener('wheel', keyboard, true);
    window.removeEventListener('pointermove', pointer);
    window.removeEventListener('blur', suspend);
  });
}

/** Dialogs consume controller input before editor bindings. Focus stays inside
 * the visible modal, including the help's manually selected input guide. */
export function navigateDialog(control: GamepadControl): boolean {
  const dialog = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))
    .reverse()
    .find((item) => item.getClientRects().length > 0);
  if (!dialog) return false;
  const controls = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
    ),
  ).filter((item) => item.getClientRects().length > 0 && !item.closest('[inert]'));
  if (control === 'b' || control === 'menu') {
    (document.activeElement ?? dialog).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
  } else if (control === 'a') {
    if (document.activeElement instanceof HTMLElement && controls.includes(document.activeElement))
      document.activeElement.click();
    else controls[0]?.focus();
  } else if (['up', 'down', 'left', 'right'].includes(control)) {
    const current = controls.findIndex((item) => item === document.activeElement);
    const direction = control === 'up' || control === 'left' ? -1 : 1;
    const target =
      controls[current < 0 ? 0 : (current + direction + controls.length) % controls.length];
    target?.focus();
    target?.scrollIntoView({ block: 'nearest' });
  } else if (control === 'lt' || control === 'rt') {
    dialog
      .querySelector<HTMLElement>('[data-gamepad-scroll]')
      ?.scrollBy({ top: control === 'lt' ? -180 : 180 });
  }
  return true;
}
