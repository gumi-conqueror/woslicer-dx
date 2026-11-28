import { inject, provide, type InjectionKey } from 'vue';
import { gridStepTicks } from '../core/gridlines';
import { MAX_TICKS, MEASURE_TICKS } from '../core/timebase';
import {
  clampGroupDelta,
  normalizeSelection,
  offsetsToTargets,
  resolvePaste,
  selectionToOffsets,
} from '../core/markers';
import type { EditorStore } from './editor-store';
import type { MarkerKey } from '../project/schema';
import { remapMarkerKeys, type MarkerKeys } from '../project/marker-keys';
import { currentTrack } from '../project/codec';
import {
  applyMarkerEdit,
  linkAt,
  linkMarkersTo as copyLinkedMarkers,
  relinkMarkers as relinkTrackMarkers,
  unlinkMarkers as unlinkTrackMarkers,
} from '../project/marker-links';

/**
 * The delta that a group of markers can move by: as close to `delta` as the
 * marker map and, with audio, the last legal tick allow. The group keeps its spacing.
 */
export function groupMoveDelta(
  editor: EditorStore,
  ticks: readonly number[],
  delta: number,
): number {
  let applied = clampGroupDelta(ticks, delta);
  if (editor.source && ticks.length) {
    // The same integer export boundary as marker placement (the source end is legal).
    let low = 0,
      high = MAX_TICKS - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (editor.tickBeyondEnd(middle)) high = middle - 1;
      else low = middle;
    }
    applied = Math.max(-Math.min(...ticks), Math.min(applied, low - Math.max(...ticks)));
  }
  return applied;
}

/** Moves `ticks` by `delta` in one undo step; their key attributes and selection move with them. */
export function moveMarkers(editor: EditorStore, ticks: readonly number[], delta: number): number {
  const applied = groupMoveDelta(editor, ticks, delta);
  if (!applied) return 0;
  const target = (tick: number) => (ticks.includes(tick) ? tick + applied : tick);
  editor.setTicks(
    [...editor.ticks.filter((t) => !ticks.includes(t)), ...ticks.map((t) => t + applied)],
    remapMarkerKeys(editor.markerKeys, target),
    target,
  );
  editor.setSelectedTicks(ticks.map((t) => t + applied));
  return applied;
}

/** Markers of some tracks at one tick. */
export interface LinkPoints {
  tick: number;
  trackIds: readonly string[];
}

export function createEditorActions(editor: EditorStore) {
  // A clipboard belongs to the document it was copied in. After the document
  // is replaced, a paste finds the clipboard empty.
  interface Clipboard {
    generation: number;
    offsets: number[];
    keys: MarkerKeys;
  }
  let measureClipboard: Clipboard | null = null;
  let selectionClipboard: (Clipboard & { origin: number }) | null = null;
  function ofThisDocument<T extends Clipboard>(clipboard: T | null): T | null {
    return clipboard?.generation === editor.documentGeneration ? clipboard : null;
  }
  function setMarker(tick: number, enabled = true, keys: readonly MarkerKey[] = []): boolean {
    editor.cancelDraft();
    if (
      !Number.isInteger(tick) ||
      tick < 0 ||
      tick >= MAX_TICKS ||
      (enabled && editor.tickBeyondEnd(tick))
    ) {
      editor.setStatus('cutBeyondEnd', true);
      return false;
    }
    return editor.setTicks(
      enabled ? [...editor.ticks, tick] : editor.ticks.filter((t) => t !== tick),
      enabled && keys.length ? [...editor.markerKeys, { tick, keys }] : editor.markerKeys,
    );
  }
  function toggleMarker(tick = editor.cursorTick): boolean {
    return setMarker(tick, !editor.ticks.includes(tick));
  }
  function removeSelected(): void {
    editor.cancelDraft();
    editor.setTicks(editor.ticks.filter((t) => !editor.selectedTicks.includes(t)));
  }
  function applyBmhelperCuts(ticks: readonly number[]): void {
    const accepted = [...new Set(ticks.filter((tick) => editor.legalTick(tick)))];
    const dropped = ticks.filter((tick) => !editor.legalTick(tick)).length;
    if (!accepted.length) {
      editor.setStatus('bmhNoDivision', true);
      return;
    }
    editor.setTicks(accepted, []);
    editor.setSelectedTicks([]);
    editor.setSelection(null, null);
    // MIDI has no reliable source tempo here. Preserve the current document BPM.
    editor.setStatus(dropped ? 'bmhAppliedDropped' : 'bmhApplied', {
      count: accepted.length,
      dropped,
    });
  }
  function copySelection(): void {
    editor.cancelDraft();
    const selected = editor.selectedTicks.filter((t) => editor.ticks.includes(t));
    const origin = selected[0];
    selectionClipboard =
      origin === undefined
        ? null
        : {
            generation: editor.documentGeneration,
            offsets: selectionToOffsets(selected),
            origin,
            keys: remapMarkerKeys(
              editor.markerKeys.filter((entry) => selected.includes(entry.tick)),
              (tick) => tick - origin,
            ),
          };
  }
  function cutSelection(): void {
    copySelection();
    removeSelected();
  }
  function pasteSelection(): boolean {
    editor.cancelDraft();
    const clipboard = ofThisDocument(selectionClipboard);
    if (!clipboard) {
      editor.setStatus('pasteClipboardEmpty', true);
      return false;
    }
    const { offsets, origin, keys } = clipboard;
    if (offsets.some((t) => !editor.legalTick(t + editor.cursorTick))) {
      editor.setStatus('cutBeyondEnd', true);
      return false;
    }
    const self =
      editor.cursorTick === origin ? new Set(offsetsToTargets(offsets, origin)) : new Set<number>();
    const pasted = resolvePaste(offsets, editor.cursorTick, new Set(editor.ticks), self);
    if (!pasted.ok) {
      editor.setStatus('pasteRejected', { tick: editor.cursorTick, reason: pasted.reason }, true);
      return false;
    }
    editor.setTicks(
      [...editor.ticks, ...pasted.ticks],
      [...editor.markerKeys, ...remapMarkerKeys(keys, (tick) => tick + editor.cursorTick)],
    );
    editor.setSelectedTicks(pasted.ticks);
    return true;
  }
  function quantizeSelection(): boolean {
    editor.cancelDraft();
    const cell = gridStepTicks(editor.grid);
    const selected = editor.selectedTicks.filter((t) => editor.ticks.includes(t));
    const targets = selected.map((t) => Math.min(MAX_TICKS - 1, Math.round(t / cell) * cell));
    if (targets.some((t) => !editor.legalTick(t))) {
      editor.setStatus('cutBeyondEnd', true);
      return false;
    }
    const destinations = new Map(selected.map((tick, index) => [tick, targets[index] ?? tick]));
    const target = (tick: number) => destinations.get(tick) ?? tick;
    const changed = editor.setTicks(
      [...editor.ticks.filter((t) => !selected.includes(t)), ...targets],
      remapMarkerKeys(editor.markerKeys, target),
      target,
    );
    editor.setSelectedTicks(targets);
    return changed;
  }
  function moveSelection(delta: number): number {
    editor.cancelDraft();
    if (!Number.isInteger(delta)) return 0;
    return moveMarkers(
      editor,
      editor.selectedTicks.filter((t) => editor.ticks.includes(t)),
      delta,
    );
  }
  function shiftAll(delta: number): boolean {
    editor.cancelDraft();
    if (
      !Number.isInteger(delta) ||
      (delta > 0 && editor.ticks.some((t) => editor.tickBeyondEnd(t + delta)))
    )
      return false;
    const target = (tick: number) => tick + delta;
    return editor.setTicks(
      normalizeSelection(editor.ticks.map(target)),
      remapMarkerKeys(editor.markerKeys, target),
      target,
    );
  }
  function undo(): boolean {
    return editor.undo();
  }
  function redo(): boolean {
    return editor.redo();
  }
  function clearMarkers(): void {
    editor.setTicks([]);
  }
  function selectAll(): void {
    editor.setSelectedTicks(editor.ticks);
  }
  function clearSelection(): void {
    editor.setSelectedTicks([]);
    editor.setSelection(null, null);
  }
  function measureBase(): number {
    return Math.floor(editor.cursorTick / MEASURE_TICKS) * MEASURE_TICKS;
  }
  /** The measure of the cursor, counted from 1 as the status bar shows it. */
  function measureNumber(): number {
    return measureBase() / MEASURE_TICKS + 1;
  }
  /** Copies the markers of the cursor's measure to the measure clipboard. */
  function measureCopy(): void {
    editor.cancelDraft();
    const base = measureBase();
    measureClipboard = {
      generation: editor.documentGeneration,
      offsets: editor.ticks
        .filter((tick) => tick >= base && tick < base + MEASURE_TICKS)
        .map((tick) => tick - base),
      keys: remapMarkerKeys(
        editor.markerKeys.filter(
          (entry) => entry.tick >= base && entry.tick < base + MEASURE_TICKS,
        ),
        (tick) => tick - base,
      ),
    };
    editor.setStatus('copiedMeasure', { measure: measureNumber() });
  }
  function measureCut(): void {
    measureCopy();
    const base = measureBase();
    editor.setTicks(editor.ticks.filter((t) => t < base || t >= base + MEASURE_TICKS));
    editor.setStatus('cutMeasure', { measure: measureNumber() });
  }
  /** Replaces the markers of the cursor's measure with the measure clipboard. */
  function measurePaste(): boolean {
    editor.cancelDraft();
    const clipboard = ofThisDocument(measureClipboard);
    if (!clipboard) {
      editor.setStatus('measureClipboardEmpty', true);
      return false;
    }
    const base = measureBase();
    if (clipboard.offsets.some((tick) => !editor.legalTick(base + tick))) {
      editor.setStatus('cutBeyondEnd', true);
      return false;
    }
    const ticks = editor.ticks.filter((t) => t < base || t >= base + MEASURE_TICKS);
    ticks.push(...clipboard.offsets.map((tick) => base + tick));
    const changed = editor.setTicks(ticks, [
      ...editor.markerKeys.filter(
        (entry) => entry.tick < base || entry.tick >= base + MEASURE_TICKS,
      ),
      ...remapMarkerKeys(clipboard.keys, (tick) => tick + base),
    ]);
    editor.setStatus('pastedMeasure', { measure: measureNumber() });
    return changed;
  }
  /** The selected markers, or all markers of the current track when none are selected. */
  function linkTargets(): number[] {
    return editor.selectedTicks.length ? [...editor.selectedTicks] : [...editor.ticks];
  }
  /** Copies the selected (or all) markers to other tracks as linked markers. */
  function linkMarkersTo(trackIds: readonly string[]): number {
    editor.cancelDraft();
    const source = editor.track.trackId;
    const targets = trackIds.filter((id) => id !== source);
    const count =
      editor.transact((draft) =>
        copyLinkedMarkers(draft.tracks, source, linkTargets(), targets, editor.markerAllowed),
      ).value ?? 0;
    editor.setStatus('markersLinked', { count, tracks: targets.length });
    return count;
  }
  function linkMarkersToAllTracks(): number {
    return linkMarkersTo(editor.document.tracks.map((item) => item.trackId));
  }
  /** Removes the selected (or all) markers of the current track from their link groups. */
  function unlinkMarkers(): number {
    editor.cancelDraft();
    const ticks = linkTargets();
    const count = editor.editTrack((track) => unlinkTrackMarkers(track, ticks)).value;
    editor.setStatus('markersUnlinked', { count });
    return count;
  }
  /** Links the selected (or all) markers with markers at exactly the same ticks on other tracks. */
  function relinkMarkers(): number {
    editor.cancelDraft();
    const ticks = linkTargets();
    const trackId = editor.track.trackId;
    const count = editor.transact((draft) =>
      relinkTrackMarkers(draft.tracks, trackId, ticks),
    ).value;
    editor.setStatus(count ? 'markersRelinked' : 'markersRelinkNone', { count });
    return count;
  }
  /**
   * Links the markers of the given tracks at each tick, adding markers where a
   * track has none, in one undoable edit. A tick needs at least two tracks.
   */
  function linkPoints(points: readonly LinkPoints[]): number {
    editor.cancelDraft();
    const count =
      editor.transact((draft) =>
        points.reduce(
          (sum, { tick, trackIds }) =>
            sum + linkAt(draft.tracks, tick, trackIds, editor.markerAllowed),
          0,
        ),
      ).value ?? 0;
    editor.setStatus(count ? 'markersLinked' : 'markersRelinkNone', {
      count,
      tracks: new Set(points.flatMap((point) => point.trackIds)).size,
    });
    return count;
  }
  /** Removes the markers of the given tracks at each tick from their link groups, in one undoable edit. */
  function unlinkPoints(points: readonly LinkPoints[]): number {
    editor.cancelDraft();
    const count =
      editor.transact((draft) =>
        points.reduce(
          (sum, { tick, trackIds }) =>
            sum +
            draft.tracks
              .filter((item) => trackIds.includes(item.trackId))
              .reduce((total, item) => total + unlinkTrackMarkers(item, [tick]), 0),
          0,
        ),
      ).value ?? 0;
    editor.setStatus('markersUnlinked', { count });
    return count;
  }
  /**
   * Adds or removes one track's marker at a tick, on that track only, even
   * with shared markers. A removed linked marker leaves its link.
   */
  function toggleTrackMarker(trackId: string, tick: number): boolean {
    editor.cancelDraft();
    const track = editor.document.tracks.find((item) => item.trackId === trackId);
    if (!track) return false;
    const present = track.slicing.markers.includes(tick);
    if (!present && !editor.markerAllowed(trackId, tick)) {
      editor.setStatus('cutBeyondEnd', true);
      return false;
    }
    return editor.transact((draft) => {
      const { slicing } = currentTrack(draft, trackId);
      applyMarkerEdit(
        draft.tracks,
        trackId,
        {
          markers: present ? slicing.markers.filter((t) => t !== tick) : [...slicing.markers, tick],
          keys: slicing.markerKeys ?? [],
          target: (value) => value,
        },
        false,
        editor.markerAllowed,
      );
    }).changed;
  }
  function toggleSharedMarkers(): void {
    editor.sharedMarkers = !editor.sharedMarkers;
    editor.setStatus(editor.sharedMarkers ? 'sharedMarkersOn' : 'sharedMarkersOff');
  }
  return {
    setMarker,
    toggleMarker,
    removeSelected,
    applyBmhelperCuts,
    copySelection,
    cutSelection,
    pasteSelection,
    quantizeSelection,
    moveSelection,
    shiftAll,
    undo,
    redo,
    clearMarkers,
    selectAll,
    clearSelection,
    measureCopy,
    measureCut,
    measurePaste,
    linkMarkersTo,
    linkMarkersToAllTracks,
    unlinkMarkers,
    relinkMarkers,
    toggleSharedMarkers,
    linkPoints,
    unlinkPoints,
    toggleTrackMarker,
  };
}
export type EditorActions = ReturnType<typeof createEditorActions>;
export const editorActionsKey: InjectionKey<EditorActions> = Symbol('editor-actions');
export function provideEditorActions(actions: EditorActions): void {
  provide(editorActionsKey, actions);
}
export function useEditorActions(): EditorActions {
  const actions = inject(editorActionsKey);
  if (!actions) throw new Error('Editor actions provider is missing');
  return actions;
}
