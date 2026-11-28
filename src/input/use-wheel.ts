import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import { commandEnabled, type AppCommand, type CommandState } from '../commands/commands';
import { stepWheel, type WheelEvent, type WheelState } from './wheel';
import { useWheelLayout } from './wheel-layout';

import type { Pointing } from './gamepad';

/** The wheel's diameter as a share of the smaller window side. */
export const WHEEL_VIEWPORT_SHARE = 2 / 3;
/** Distance from the center to each slot, as a share of the diameter. A mouse pointer there has full travel. */
export const WHEEL_SLOT_RADIUS_SHARE = 0.34;
const ARROWS: Partial<Record<string, 'up' | 'right' | 'down' | 'left'>> = {
  ArrowUp: 'up',
  ArrowRight: 'right',
  ArrowDown: 'down',
  ArrowLeft: 'left',
};
export function wheelDiameter(): number {
  return Math.min(window.innerWidth, window.innerHeight) * WHEEL_VIEWPORT_SHARE;
}

/**
 * The open command wheel and its keyboard and mouse handling. The controller
 * path sends the same events from the app's controller routing.
 */
export function useCommandWheel(options: {
  state: CommandState;
  run: (command: AppCommand) => void;
}) {
  const layout = useWheelLayout();
  const wheels = computed(() => layout.wheels);
  /** The open page; a removed page falls back to the last remaining one. */
  const openPage = computed(() => Math.min(state.value.page, wheels.value.length - 1));
  const state = shallowRef<WheelState>({ open: false, page: 0 });
  /** Viewport position of the wheel center; `null` centers it in the window. */
  const center = shallowRef<{ x: number; y: number } | null>(null);
  let holdCode: string | undefined;
  let pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  function send(event: WheelEvent): void {
    const slots = wheels.value[openPage.value];
    const step = stepWheel(state.value, event);
    state.value = step.state;
    if (!step.state.open) holdCode = undefined;
    const command = step.chosen === undefined ? undefined : slots?.[step.chosen];
    if (command && commandEnabled(command, options.state)) options.run(command);
  }
  /** Opens the wheel held by a controller; it appears in the middle of the window. */
  function holdFromController(time: number): void {
    if (!state.value.open) {
      center.value = null;
      lastPointing = null;
    }
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
  /**
   * A stick that returns to its center deselects, like a mouse pointer. A
   * D-pad press stays selected after release, so a tap can then be confirmed.
   */
  let lastPointing: Pointing['from'] = null;
  function pointController({ x, y, from }: Pointing): void {
    if (!state.value.open) return;
    if (from) lastPointing = from;
    // A wheel kept open by a tap moves with D-pad steps instead; see `step`.
    if (from === 'dpad' && state.value.mode === 'sticky') return;
    send({ type: 'point', x, y, keepAtCenter: !from && lastPointing === 'dpad' });
  }
  /** Moves the selection of a wheel kept open by a tap one slot toward a direction. */
  function step(direction: 'up' | 'right' | 'down' | 'left'): void {
    if (!state.value.open || state.value.mode !== 'sticky') return;
    send({ type: 'step', toward: { up: 0, right: 2, down: 4, left: 6 }[direction] });
  }
  function page(delta: number): void {
    send({ type: 'page', delta, pages: wheels.value.length });
  }

  function pointerMove(event: PointerEvent): void {
    pointer = { x: event.clientX, y: event.clientY };
    const origin = center.value;
    if (!state.value.open || !origin) return;
    const radius = wheelDiameter() * WHEEL_SLOT_RADIUS_SHARE;
    send({
      type: 'point',
      x: (event.clientX - origin.x) / radius,
      y: (event.clientY - origin.y) / radius,
      keepAtCenter: false,
    });
  }
  function keydown(event: KeyboardEvent): void {
    if (!state.value.open) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    const arrow = ARROWS[event.key];
    if (arrow) step(arrow);
    else if (event.key === 'Escape') send({ type: 'cancel' });
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
    openPage,
    send,
    page,
    step,
    cancel,
    holdFromController,
    holdFromKey,
    pointController,
  };
}
export type CommandWheel = ReturnType<typeof useCommandWheel>;
