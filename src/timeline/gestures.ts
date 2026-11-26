import { shallowRef } from 'vue';
import type { EditorStore } from '../slicing/editor-store';
import { markerTicks } from '@gumi-conqueror/wos-file';
import { gridStepTicks } from '../core/gridlines';
import { MAX_TICKS, resolveBreakpointTick } from '../core/timebase';
import type { Ghost } from './render';
import { groupMoveDelta, moveMarkers } from '../slicing/editor-actions';

/** CSS pixels: a press this close to a marker grabs it. */
const HIT_RADIUS_PX = 10;
/** CSS pixels: the eraser removes markers this close to the pointer path. */
const ERASE_RADIUS_PX = 8;
/** CSS pixels: a press becomes a paint stroke after this much movement. */
const DRAG_START_PX = 3;
/** CSS pixels: free (unsnapped) painting adds a marker after this much movement. */
const FREEHAND_STEP_PX = 2;

export interface TimelinePointer {
  x: number;
  y: number;
  button: number;
  altKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
}
type Selection = { ticks: number[]; start: number | null; end: number | null };
/** One active pointer gesture with its private draft state. */
interface Gesture {
  /** Document revision at the start; drafts of an outdated document are discarded. */
  revision?: number;
  /** Selection to restore when the gesture is cancelled. */
  selection?: Selection;
  move(point: TimelinePointer): void;
  /** Commits the gesture. */
  end(point: TimelinePointer): void;
  /** Undoes the gesture's own live changes, such as scrolling. */
  cancel(): void;
}

/** Gesture transaction state, independent of DOM listeners and canvas drawing. */
export function createTimelineGestures(editor: EditorStore) {
  let gesture: Gesture | null = null;
  const ghost = shallowRef<Ghost>();
  const cursor = shallowRef('copy');
  const unregister = editor.registerDraftCancellation(() => {
    cancel();
  });
  function bitmap(): Uint8Array {
    const value = new Uint8Array(MAX_TICKS);
    for (const tick of editor.ticks) value[tick] = 1;
    return value;
  }
  const tickAt = (x: number) => editor.scrollTick + x / editor.pxPerTick;
  const clamped = (tick: number) => Math.max(0, Math.min(MAX_TICKS - 1, Math.round(tick)));
  const paintTick = (point: TimelinePointer) =>
    resolveBreakpointTick(tickAt(point.x), editor.snap, gridStepTicks(editor.grid), point.altKey);
  const selection = (): Selection => ({
    ticks: [...editor.selectedTicks],
    start: editor.selectionStartTick,
    end: editor.selectionEndTick,
  });
  function restoreSelection(value: Selection): void {
    editor.setSelectedTicks(value.ticks);
    editor.setSelection(value.start, value.end);
  }
  function near(x: number): number | undefined {
    const target = tickAt(x);
    let nearest: number | undefined,
      distance = HIT_RADIUS_PX / editor.pxPerTick;
    for (const tick of editor.ticks)
      if (Math.abs(tick - target) <= distance) {
        nearest = tick;
        distance = Math.abs(tick - target);
      }
    return nearest;
  }
  function paint(tick: number, changed: Set<number>, draft: Uint8Array): void {
    if (!editor.legalTick(tick) || draft[tick] === 1) return;
    draft[tick] = 1;
    changed.add(tick);
  }
  function paintSegment(
    from: number,
    to: number,
    point: TimelinePointer,
    changed: Set<number>,
    draft: Uint8Array,
  ): void {
    const step = gridStepTicks(editor.grid);
    if (editor.snap && !point.altKey && step > 0) {
      for (let tick = Math.min(from, to); tick <= Math.max(from, to); tick += step)
        paint(Math.round(tick), changed, draft);
    } else paint(to, changed, draft);
  }
  function erase(first: number, last: number, draft: Uint8Array): number {
    const radius = ERASE_RADIUS_PX / editor.pxPerTick;
    const hits = markerTicks(draft).filter(
      (tick) => tick >= Math.min(first, last) - radius && tick <= Math.max(first, last) + radius,
    );
    for (const tick of hits) draft[tick] = 0;
    editor.setPreviewTicks(markerTicks(draft));
    return hits.length;
  }
  /** Starts the gesture this press means. Order matters: button, then modifiers, then hit test. */
  function begin(point: TimelinePointer): void {
    cancel();
    if (point.button === 1) gesture = pan(point);
    else if (point.button === 2) gesture = eraseStroke(point);
    else if (point.button !== 0) return;
    else if (point.shiftKey || point.ctrlKey) gesture = boxSelect(point);
    else {
      const hit = near(point.x);
      gesture = hit === undefined ? paintStroke(point) : moveMarkersGesture(point, hit);
    }
  }

  /** Middle drag scrolls the view; cancelling restores the scroll position. */
  function pan(point: TimelinePointer): Gesture {
    const anchorX = point.x,
      scroll = editor.scrollTick;
    cursor.value = 'grabbing';
    return {
      move: (next) => editor.setScrollTick(scroll - (next.x - anchorX) / editor.pxPerTick),
      end: () => {},
      cancel: () => editor.setScrollTick(scroll),
    };
  }

  /** Right drag removes markers near the pointer path, committed as one edit on release. */
  function eraseStroke(point: TimelinePointer): Gesture {
    const draft = bitmap();
    let lastTick = tickAt(point.x);
    let count = erase(lastTick, lastTick, draft);
    cursor.value = 'no-drop';
    return {
      revision: editor.docRevision,
      selection: selection(),
      move: (next) => {
        const tick = tickAt(next.x);
        count += erase(lastTick, tick, draft);
        lastTick = tick;
        editor.setStatus('erasingMarkers', { count });
      },
      end: () => {
        const committed = editor.setTicks(markerTicks(draft));
        editor.setStatus(committed ? 'erasedMarkers' : 'eraseGestureNoop', { count });
      },
      cancel: () => {},
    };
  }

  /** Shift drag adds to the selection, Ctrl/Cmd drag toggles it, plain box drag replaces it. */
  function boxSelect(point: TimelinePointer): Gesture {
    const anchorTick = clamped(tickAt(point.x));
    const previous = selection();
    editor.setSelection(anchorTick, anchorTick);
    editor.setSelectedTicks([]);
    cursor.value = 'crosshair';
    editor.setStatus('boxSelectHint');
    return {
      revision: editor.docRevision,
      selection: previous,
      move: (next) => editor.setSelection(anchorTick, clamped(tickAt(next.x))),
      end: (last) => {
        const end = editor.selectionEndTick ?? anchorTick;
        const inside = editor.ticks.filter(
          (tick) => tick >= Math.min(anchorTick, end) && tick <= Math.max(anchorTick, end),
        );
        const before = previous.ticks;
        const selected = last.shiftKey
          ? [...new Set([...before, ...inside])]
          : last.ctrlKey
            ? [
                ...before.filter((tick) => !inside.includes(tick)),
                ...inside.filter((tick) => !before.includes(tick)),
              ]
            : inside;
        editor.setSelectedTicks(selected);
        const mode = last.shiftKey ? 'add' : last.ctrlKey ? 'toggle' : 'replace';
        editor.setStatus(selected.length ? 'boxSelectSelected' : 'boxSelectEmpty', {
          count: selected.length,
          mode,
        });
      },
      cancel: () => {},
    };
  }

  /** Dragging a marker moves the selected group, or the marker alone; a ghost shows the target. */
  function moveMarkersGesture(point: TimelinePointer, hit: number): Gesture {
    const previous = selection();
    const ticks = editor.selectedTicks.includes(hit) ? [...editor.selectedTicks] : [hit];
    const anchorTick = tickAt(point.x);
    editor.setSelectedTicks(ticks);
    editor.setSelection(null, null);
    cursor.value = 'ew-resize';
    editor.setStatus('draggingMarkers', { count: ticks.length });
    return {
      revision: editor.docRevision,
      selection: previous,
      move: (next) => {
        const raw = tickAt(next.x) - anchorTick,
          cell = gridStepTicks(editor.grid);
        const requested =
          editor.snap && !next.altKey && cell > 0 ? Math.round(raw / cell) * cell : Math.round(raw);
        ghost.value = { ticks, delta: groupMoveDelta(editor, ticks, requested) };
      },
      end: () => {
        const applied = moveMarkers(editor, ticks, ghost.value?.delta ?? 0);
        if (applied) editor.setStatus('movedMarkersBy', { count: ticks.length, delta: applied });
      },
      cancel: () => {},
    };
  }

  /**
   * Left press on empty space adds a marker at the cursor; dragging paints markers
   * along the path (on the grid when snapping, freehand otherwise).
   */
  function paintStroke(point: TimelinePointer): Gesture {
    const draft = bitmap();
    const changed = new Set<number>();
    const anchorTick = paintTick(point);
    let painting = false,
      lastTick = anchorTick,
      lastX = point.x;
    editor.setCursorTick(anchorTick);
    cursor.value = 'copy';
    return {
      revision: editor.docRevision,
      selection: selection(),
      move: (next) => {
        if (!painting) {
          if (Math.hypot(next.x - point.x, next.y - point.y) < DRAG_START_PX) return;
          painting = true;
          paint(anchorTick, changed, draft);
        }
        if ((!editor.snap || next.altKey) && Math.abs(next.x - lastX) < FREEHAND_STEP_PX) return;
        const tick = paintTick(next);
        paintSegment(lastTick, tick, next, changed, draft);
        lastTick = tick;
        lastX = next.x;
        editor.setPreviewTicks(markerTicks(draft));
        editor.setCursorTick(tick);
        editor.setStatus('paintingMarkers', { count: changed.size });
      },
      end: () => {
        if (!painting) paint(anchorTick, changed, draft);
        const committed = editor.setTicks(markerTicks(draft));
        editor.setStatus(committed ? 'paintedMarkers' : 'paintGestureNoop', {
          count: changed.size,
        });
      },
      cancel: () => {},
    };
  }

  /** Hover feedback when no gesture is active. */
  function hover(point: TimelinePointer): void {
    cursor.value =
      point.shiftKey || point.ctrlKey
        ? 'crosshair'
        : near(point.x) === undefined
          ? 'copy'
          : 'ew-resize';
  }
  function finish(): void {
    gesture = null;
    editor.setPreviewTicks(null);
    ghost.value = undefined;
    cursor.value = 'copy';
  }
  function move(point: TimelinePointer): void {
    if (gesture) gesture.move(point);
    else hover(point);
  }
  function end(point: TimelinePointer): void {
    const current = gesture;
    if (!current) {
      finish();
      return;
    }
    // A document replaced or edited elsewhere invalidates the draft.
    if (current.revision !== undefined && current.revision !== editor.docRevision) {
      cancel();
      return;
    }
    // Release the draft before entering the store's transaction gate.
    gesture = null;
    editor.setPreviewTicks(null);
    current.end(point);
    finish();
  }
  function cancel(): boolean {
    const current = gesture;
    if (!current) return false;
    if (current.selection && current.revision === editor.docRevision)
      restoreSelection(current.selection);
    current.cancel();
    finish();
    return true;
  }
  function wheel(x: number, deltaX: number, deltaY: number, zoom: boolean): void {
    if (zoom) editor.zoomAt(tickAt(x), deltaY < 0 ? 1.25 : 1 / 1.25);
    else editor.setScrollTick(editor.scrollTick + (deltaX + deltaY) / editor.pxPerTick);
  }
  return { begin, move, end, cancel, wheel, ghost, cursor, dispose: unregister };
}
