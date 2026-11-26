import { onMounted, onUnmounted } from 'vue';
import {
  createGamepadReader,
  GAMEPAD_DEAD_ZONE,
  pointingVector,
  TRIGGER_PRESS,
  type Pointing,
  type GamepadEvent,
  type UiNavigation,
} from './gamepad';
import { useInputState } from './state';
import { visibleDialog } from './context';

/** One controller poll: its events and the pointing direction for the command wheel. */
export interface GamepadFrame {
  events: readonly GamepadEvent[];
  pointing: Pointing;
  time: number;
}

export function useInputControls(
  onFrame: (frame: GamepadFrame) => void,
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
          ...pad.buttons.map((button) => (button.pressed || button.value > TRIGGER_PRESS ? 1 : 0)),
          ...pad.axes.map((axis) => (Math.abs(axis) > GAMEPAD_DEAD_ZONE ? Math.sign(axis) : 0)),
        ].join(',')
      : '';
    if (enabled && activity !== lastActivity && /1/.test(activity)) input.device = 'gamepad';
    lastActivity = activity;
    const events = read(pad, now, enabled, recordingActive());
    if (!pad && input.device === 'gamepad') input.device = 'keyboard';
    if (events.some((event) => event.phase !== 'release')) input.device = 'gamepad';
    onFrame({ events, pointing: pointingVector(pad), time: now });
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

/**
 * Controller navigation inside the topmost visible dialog. Focus stays inside
 * the dialog, including the help's manually selected input guide.
 */
export function navigateDialog(action: UiNavigation): void {
  const dialog = visibleDialog();
  if (!dialog) return;
  const controls = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]',
    ),
  ).filter((item) => item.getClientRects().length > 0 && !item.closest('[inert]'));
  if (action === 'cancel' || action === 'toggle') {
    // Element Plus dialogs close on Escape; a synthetic key reuses that path.
    (document.activeElement ?? dialog).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
  } else if (action === 'confirm') {
    if (document.activeElement instanceof HTMLElement && controls.includes(document.activeElement))
      document.activeElement.click();
    else controls[0]?.focus();
  } else if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
    const current = controls.findIndex((item) => item === document.activeElement);
    const direction = action === 'up' || action === 'left' ? -1 : 1;
    const target =
      controls[current < 0 ? 0 : (current + direction + controls.length) % controls.length];
    target?.focus();
    target?.scrollIntoView({ block: 'nearest' });
  } else if (action === 'scroll-up' || action === 'scroll-down') {
    dialog
      .querySelector<HTMLElement>('[data-gamepad-scroll]')
      ?.scrollBy({ top: action === 'scroll-up' ? -180 : 180 });
  }
}
