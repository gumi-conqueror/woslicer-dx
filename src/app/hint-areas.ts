import type { AppCommand } from './commands';
import { CANCEL, chordKeys, PRIMARY_KEY } from '../input/bindings';
import type { MouseGesture } from '../ui/mouse';

/** A mouse action: optional held keys, a mouse gesture, and what it does. */
export interface MouseHint {
  keys?: readonly string[];
  mouse?: MouseGesture;
  label: string;
}

/**
 * Areas that show their mouse and keyboard actions in the status bar while the
 * pointer is over them. The user guide lists the same mouse actions. An element names its area with `data-hint-area`; the
 * innermost area under the pointer wins. Keyboard shortcuts come from the bindings.
 */
export const HINT_AREAS = {
  timeline: {
    title: 'hints.areaTimeline',
    mouse: [
      { mouse: { button: 'left', action: 'drag' }, label: 'hints.addMarkers' },
      { mouse: { button: 'right', action: 'drag' }, label: 'hints.removeMarkers' },
      { mouse: { button: 'left', action: 'drag' }, label: 'hints.moveMarkers' },
      { keys: ['Shift'], mouse: { button: 'left', action: 'drag' }, label: 'hints.addRange' },
      {
        keys: [PRIMARY_KEY],
        mouse: { button: 'left', action: 'drag' },
        label: 'hints.toggleRange',
      },
      { keys: ['Alt'], label: 'hints.noSnap' },
      { keys: CANCEL.flatMap(chordKeys), label: 'hints.cancelDrag' },
      { mouse: { button: 'middle', action: 'drag' }, label: 'hints.moveView' },
      { mouse: { button: 'wheel' }, label: 'hints.scroll' },
      { keys: [PRIMARY_KEY], mouse: { button: 'wheel' }, label: 'hints.zoom' },
    ],
    commands: ['toggle-marker', 'play-pause', 'undo'],
  },
  ruler: {
    title: 'hints.areaRuler',
    mouse: [
      { mouse: { button: 'left', action: 'click' }, label: 'hints.seek' },
      { mouse: { button: 'wheel' }, label: 'hints.zoom' },
    ],
    commands: ['zoom-fit', 'zoom-in', 'zoom-out'],
  },
  overview: {
    title: 'hints.areaOverview',
    mouse: [{ mouse: { button: 'left', action: 'drag' }, label: 'hints.moveView' }],
    commands: ['zoom-fit'],
  },
  track: {
    title: 'hints.areaTrack',
    mouse: [
      { mouse: { button: 'left', action: 'click' }, label: 'hints.selectTrack' },
      { mouse: { button: 'left', action: 'double' }, label: 'hints.renameTrack' },
      { mouse: { button: 'right', action: 'click' }, label: 'hints.trackMenu' },
    ],
    commands: [
      'rename-track',
      'toggle-track-mute',
      'toggle-track-solo',
      'previous-track',
      'next-track',
    ],
  },
  markers: {
    title: 'hints.areaMarkers',
    mouse: [
      { mouse: { button: 'left', action: 'click' }, label: 'hints.selectCell' },
      { mouse: { button: 'left', action: 'double' }, label: 'hints.selectLinked' },
      { mouse: { button: 'left', action: 'triple' }, label: 'hints.selectRow' },
      { mouse: { button: 'middle', action: 'click' }, label: 'hints.linkCells' },
      { mouse: { button: 'right', action: 'click' }, label: 'hints.goToMarker' },
      { mouse: { button: 'right', action: 'double' }, label: 'hints.toggleCellMarker' },
    ],
    commands: ['link-markers-all-tracks', 'unlink-markers'],
  },
} as const satisfies Record<
  string,
  { title: string; mouse: readonly MouseHint[]; commands: readonly AppCommand[] }
>;
export type HintArea = keyof typeof HINT_AREAS;

export function isHintArea(value: unknown): value is HintArea {
  return typeof value === 'string' && Object.hasOwn(HINT_AREAS, value);
}
