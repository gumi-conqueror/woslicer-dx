import type { AppCommand } from '../app/commands';

/**
 * The command wheel: hold the wheel control, point at a slot, release to run
 * it. A short tap keeps the wheel open for a later confirm or click.
 * Slots run clockwise from the top: up, up-right, right, … , up-left.
 */
export const WHEEL_SLOTS = 8;
export type WheelSlots = readonly (AppCommand | null)[];
export const DEFAULT_WHEELS: readonly WheelSlots[] = [
  [
    'copy-selection',
    'select-all',
    'redo',
    'preview-previous',
    'paste-selection',
    'measure-paste',
    'undo',
    'cut-selection',
  ],
  [
    'save-project',
    'export-slice',
    'copy-bmse',
    'export-wos',
    'export-all',
    'toggle-recording',
    'paste-bmse',
    'open-audio',
  ],
];

/** Pointer travel, from 0 at the center to 1 at the rim, that selects a slot. */
const SELECT_TRAVEL = 0.55;
/** Below this travel a mouse pointer leaves its slot; the gap prevents flicker. */
const KEEP_TRAVEL = 0.35;
/** Extra angle a pointer must cross past a slot edge before the next slot takes over. */
const EDGE_HYSTERESIS = (6 * Math.PI) / 180;
/** A release this soon after opening, without pointing, keeps the wheel open. */
export const WHEEL_TAP_MS = 250;
const SLOT_ANGLE = (2 * Math.PI) / WHEEL_SLOTS;

export type WheelState =
  | { open: false; page: number }
  | {
      open: true;
      page: number;
      mode: 'hold' | 'sticky';
      selected: number | null;
      openedAt: number;
      pointed: boolean;
    };
export type WheelEvent =
  | { type: 'open'; time: number }
  | {
      type: 'point';
      x: number;
      y: number;
      /** A released D-pad keeps its last slot; a centered stick or mouse deselects. */
      keepAtCenter: boolean;
    }
  | { type: 'release'; time: number }
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'page'; delta: number; pages: number }
  | { type: 'choose'; slot: number };

/** Clockwise angle from the top for screen coordinates (x right, y down). */
function angleOf(x: number, y: number): number {
  return Math.atan2(x, -y);
}
function slotAt(x: number, y: number): number {
  return ((Math.round(angleOf(x, y) / SLOT_ANGLE) % WHEEL_SLOTS) + WHEEL_SLOTS) % WHEEL_SLOTS;
}
function pointedSlot(
  selected: number | null,
  x: number,
  y: number,
  keepAtCenter: boolean,
): number | null {
  const travel = Math.hypot(x, y);
  if (travel < KEEP_TRAVEL) return keepAtCenter ? selected : null;
  if (selected !== null) {
    const offset = angleOf(x, y) - selected * SLOT_ANGLE;
    const distance = Math.abs(Math.atan2(Math.sin(offset), Math.cos(offset)));
    if (distance <= SLOT_ANGLE / 2 + EDGE_HYSTERESIS) return selected;
  }
  return travel >= SELECT_TRAVEL ? slotAt(x, y) : selected;
}

const closed = (page: number): WheelState => ({ open: false, page });

/** The next wheel state, and the slot to run when the event chooses one. */
export function stepWheel(
  state: WheelState,
  event: WheelEvent,
): { state: WheelState; chosen?: number } {
  if (!state.open) {
    if (event.type !== 'open') return { state };
    return {
      state: {
        open: true,
        page: state.page,
        mode: 'hold',
        selected: null,
        openedAt: event.time,
        pointed: false,
      },
    };
  }
  switch (event.type) {
    case 'open':
      // Pressing the wheel control again closes a wheel that a tap kept open.
      return state.mode === 'sticky' ? { state: closed(state.page) } : { state };
    case 'point': {
      const selected = pointedSlot(state.selected, event.x, event.y, event.keepAtCenter);
      return { state: { ...state, selected, pointed: state.pointed || selected !== null } };
    }
    case 'release':
      if (state.mode === 'sticky') return { state };
      if (state.selected !== null) return { state: closed(state.page), chosen: state.selected };
      if (!state.pointed && event.time - state.openedAt < WHEEL_TAP_MS)
        return { state: { ...state, mode: 'sticky' } };
      return { state: closed(state.page) };
    case 'confirm':
      return state.selected === null
        ? { state }
        : { state: closed(state.page), chosen: state.selected };
    case 'cancel':
      return { state: closed(state.page) };
    case 'page':
      return {
        state: { ...state, page: (state.page + event.delta + event.pages) % event.pages },
      };
    case 'choose':
      return { state: closed(state.page), chosen: event.slot };
  }
}
