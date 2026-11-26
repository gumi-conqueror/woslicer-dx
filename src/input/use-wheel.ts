import { onMounted, onUnmounted, shallowRef } from 'vue';
import { commandEnabled, type AppCommand, type CommandState } from '../app/commands';
import { DEFAULT_WHEELS, stepWheel, type WheelEvent, type WheelState } from './wheel';

/** CSS pixels from the wheel center to a mouse pointer at full travel. */
export const WHEEL_POINTER_RADIUS_PX = 90;

/**
 * The open command wheel and its keyboard and mouse handling. The controller
 * path sends the same events from the app's controller routing.
 */
export function useCommandWheel(options: {
  state: CommandState;
  run: (command: AppCommand) => void;
}) {
  const wheels = DEFAULT_WHEELS;
  const state = shallowRef<WheelState>({ open: false, page: 0 });
  /** Viewport position of the wheel center; `null` centers it in the window. */
  const center = shallowRef<{ x: number; y: number } | null>(null);
  let holdCode: string | undefined;
  let pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  function send(event: WheelEvent): void {
    const page = wheels[state.value.page];
    const step = stepWheel(state.value, event);
    state.value = step.state;
    if (!step.state.open) holdCode = undefined;
    const command = step.chosen === undefined ? undefined : page?.[step.chosen];
    if (command && commandEnabled(command, options.state)) options.run(command);
  }
  /** Opens the wheel held by a controller; it appears in the middle of the window. */
  function holdFromController(time: number): void {
    if (!state.value.open) center.value = null;
    send({ type: 'open', time });
  }
  /** Opens the wheel held by a keyboard key; it appears at the mouse pointer. */
  function holdFromKey(code: string): void {
    if (!state.value.open) {
      holdCode = code;
      center.value = { ...pointer };
    }
    send({ type: 'open', time: performance.now() });
  }
  function pointController(vector: { x: number; y: number }): void {
    if (state.value.open) send({ type: 'point', ...vector, keepAtCenter: true });
  }
  function page(delta: number): void {
    send({ type: 'page', delta, pages: wheels.length });
  }

  function pointerMove(event: PointerEvent): void {
    pointer = { x: event.clientX, y: event.clientY };
    const origin = center.value;
    if (!state.value.open || !origin) return;
    send({
      type: 'point',
      x: (event.clientX - origin.x) / WHEEL_POINTER_RADIUS_PX,
      y: (event.clientY - origin.y) / WHEEL_POINTER_RADIUS_PX,
      keepAtCenter: false,
    });
  }
  function keydown(event: KeyboardEvent): void {
    if (!state.value.open) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    if (event.key === 'Escape') send({ type: 'cancel' });
    else if (event.key === 'Enter') send({ type: 'confirm' });
    else if ((event.code || event.key) === holdCode) send({ type: 'open', time: event.timeStamp });
  }
  function keyup(event: KeyboardEvent): void {
    if (state.value.open && (event.code || event.key) === holdCode)
      send({ type: 'release', time: event.timeStamp });
  }
  function scroll(event: globalThis.WheelEvent): void {
    if (!state.value.open || event.deltaY === 0) return;
    event.preventDefault();
    page(event.deltaY > 0 ? 1 : -1);
  }
  function contextMenu(event: MouseEvent): void {
    if (!state.value.open) return;
    event.preventDefault();
    send({ type: 'cancel' });
  }
  function cancel(): void {
    if (state.value.open) send({ type: 'cancel' });
  }
  onMounted(() => {
    window.addEventListener('pointermove', pointerMove, { passive: true });
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('keyup', keyup, true);
    window.addEventListener('wheel', scroll, { passive: false, capture: true });
    window.addEventListener('contextmenu', contextMenu, true);
    window.addEventListener('blur', cancel);
  });
  onUnmounted(() => {
    window.removeEventListener('pointermove', pointerMove);
    window.removeEventListener('keydown', keydown, true);
    window.removeEventListener('keyup', keyup, true);
    window.removeEventListener('wheel', scroll, true);
    window.removeEventListener('contextmenu', contextMenu, true);
    window.removeEventListener('blur', cancel);
  });
  return {
    state,
    center,
    wheels,
    send,
    page,
    cancel,
    holdFromController,
    holdFromKey,
    pointController,
  };
}
export type CommandWheel = ReturnType<typeof useCommandWheel>;
