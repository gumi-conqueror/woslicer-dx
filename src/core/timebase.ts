import { exportSample } from './time/conversion.js';

export const MEASURE_TICKS = 192;
import { MARKER_COUNT } from '@gumi-conqueror/wos-file';
export const MAX_TICKS = MARKER_COUNT;
/** Total bytes of the marker bitmap embedded in a .wos file (49152 bits). */
export const BITMAP_BYTES = MAX_TICKS / 8;

export interface TimeBase {
  bpm: number;
  shift: number;
  sampleRate: number;
}

/** Integer sample position for preview and export. */
export function tickToSampleExport(tick: number, base: TimeBase): number {
  return exportSample(tick, { tempo: base.bpm, shift: base.shift, sampleRate: base.sampleRate });
}
/** Integer sample index for sample-indexed view operations. */
export function tickToSampleView(tick: number, base: TimeBase): number {
  return tickToSampleExport(tick, base);
}

/**
 * Nearest tick to a playhead sample position (Math.round of the inverse
 * conversion, clamped to the 49152-tick map). This is the break-point
 * mapping: playing -> marker under the playhead. Extracted from the renderer
 * so the round-back math is unit-testable without a DOM.
 */
export function sampleToTickNearest(sample: number, base: TimeBase): number {
  const approx = (sample * base.bpm * 4) / (base.sampleRate * 5) - base.shift;
  return Math.max(0, Math.min(MAX_TICKS - 1, Math.round(approx)));
}

/**
 * Break-point placement policy (frozen spec): with Snap on, a placed marker
 * aligns to the nearest multiple of `grid`; holding Alt (`bypass`) drops it
 * at the exact position regardless of Snap. Every result is a whole tick
 * clamped into [0, MAX_TICKS).
 *
 * Single source of truth for snapping: Store.snapTick delegates here (ruler
 * clicks, bypass=false) and the Enter break-point action resolves both its
 * playing and stopped branches through it.
 *
 * A non-integer or non-positive grid falls back to the unsnapped tick so a
 * bad grid value can never produce NaN.
 */
export function resolveBreakpointTick(
  tick: number,
  snap: boolean,
  grid: number,
  bypass: boolean,
): number {
  const snapUsable = snap && !bypass && Number.isInteger(grid) && grid > 0;
  if (!snapUsable) return Math.max(0, Math.min(MAX_TICKS - 1, Math.round(tick)));
  return Math.max(0, Math.min(MAX_TICKS - 1, Math.round(tick / grid) * grid));
}
