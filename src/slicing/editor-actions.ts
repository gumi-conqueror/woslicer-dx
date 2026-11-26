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

export function createEditorActions(editor: EditorStore) {
  let measureClipboard: { offsets: number[]; keys: MarkerKeys } | null = null;
  let selectionClipboard: { offsets: number[]; origin: number; keys: MarkerKeys } | null = null;
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
    if (!selectionClipboard) {
      editor.setStatus('pasteClipboardEmpty', true);
      return false;
    }
    const { offsets, origin, keys } = selectionClipboard;
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
    const changed = editor.setTicks(
      [...editor.ticks.filter((t) => !selected.includes(t)), ...targets],
      remapMarkerKeys(editor.markerKeys, (tick) => destinations.get(tick) ?? tick),
    );
    editor.setSelectedTicks(targets);
    return changed;
  }
  function moveSelection(delta: number): number {
    editor.cancelDraft();
    if (!Number.isInteger(delta)) return 0;
    const selected = editor.selectedTicks.filter((t) => editor.ticks.includes(t));
    if (delta > 0 && selected.some((t) => editor.tickBeyondEnd(t + delta))) return 0;
    const applied = clampGroupDelta(selected, delta);
    editor.setTicks(
      [...editor.ticks.filter((t) => !selected.includes(t)), ...selected.map((t) => t + applied)],
      remapMarkerKeys(editor.markerKeys, (tick) =>
        selected.includes(tick) ? tick + applied : tick,
      ),
    );
    editor.setSelectedTicks(selected.map((t) => t + applied));
    return applied;
  }
  function shiftAll(delta: number): boolean {
    editor.cancelDraft();
    if (
      !Number.isInteger(delta) ||
      (delta > 0 && editor.ticks.some((t) => editor.tickBeyondEnd(t + delta)))
    )
      return false;
    return editor.setTicks(
      normalizeSelection(editor.ticks.map((t) => t + delta)),
      remapMarkerKeys(editor.markerKeys, (tick) => tick + delta),
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
  function measureCopy(): void {
    editor.cancelDraft();
    const base = measureBase();
    measureClipboard = {
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
  }
  function measureCut(): void {
    measureCopy();
    const base = measureBase();
    editor.setTicks(editor.ticks.filter((t) => t < base || t >= base + MEASURE_TICKS));
  }
  function measurePaste(): boolean {
    editor.cancelDraft();
    if (!measureClipboard) return false;
    const measure = Math.floor(editor.cursorTick / MEASURE_TICKS);
    if (measureClipboard.offsets.some((tick) => !editor.legalTick(measure * MEASURE_TICKS + tick)))
      return false;
    const base = measure * MEASURE_TICKS;
    const ticks = editor.ticks.filter((t) => t < base || t >= base + MEASURE_TICKS);
    ticks.push(...measureClipboard.offsets.map((tick) => base + tick));
    return editor.setTicks(ticks, [
      ...editor.markerKeys.filter(
        (entry) => entry.tick < base || entry.tick >= base + MEASURE_TICKS,
      ),
      ...remapMarkerKeys(measureClipboard.keys, (tick) => tick + base),
    ]);
  }
  function reset(): void {
    measureClipboard = null;
    selectionClipboard = null;
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
    reset,
  };
}
