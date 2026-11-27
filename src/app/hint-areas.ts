import type { AppCommand } from './commands';

/**
 * Areas that show their mouse and keyboard actions in the status bar while the
 * pointer is over them. An element names its area with `data-hint-area`; the
 * innermost area under the pointer wins.
 */
export const HINT_AREAS = {
  timeline: {
    mouse: [
      'hints.timelineDrag',
      'hints.timelineRightDrag',
      'hints.timelineMove',
      'hints.timelineSelect',
      'hints.timelineAlt',
      'hints.timelineWheel',
    ],
    commands: ['toggle-marker', 'play-pause', 'undo'],
  },
  ruler: {
    mouse: ['hints.rulerClick', 'hints.rulerWheel'],
    commands: ['zoom-fit', 'zoom-in', 'zoom-out'],
  },
  overview: {
    mouse: ['hints.overviewDrag'],
    commands: ['zoom-fit'],
  },
  track: {
    mouse: ['hints.trackClick', 'hints.trackRightClick'],
    commands: [
      'rename-track',
      'toggle-track-mute',
      'toggle-track-solo',
      'previous-track',
      'next-track',
    ],
  },
  markers: {
    mouse: [
      'hints.markerClick',
      'hints.cellClick',
      'hints.cellDoubleClick',
      'hints.cellRightClick',
    ],
    commands: ['link-markers-all-tracks', 'unlink-markers'],
  },
} as const satisfies Record<string, { mouse: readonly string[]; commands: readonly AppCommand[] }>;
export type HintArea = keyof typeof HINT_AREAS;

export function isHintArea(value: unknown): value is HintArea {
  return typeof value === 'string' && Object.hasOwn(HINT_AREAS, value);
}
