import { MARKER_COUNT } from '@gumi-conqueror/wos-file';

/** Ticks per quarter note. The BMSE clipboard and BMHelper cut positions use the same unit. */
export const TICKS_PER_BEAT = 48;
/** A measure has four beats. */
export const MEASURE_TICKS = 4 * TICKS_PER_BEAT;
/** A .wos marker bitmap covers ticks 0 through WOS_TICKS - 1; .wos export drops later markers. */
export const WOS_TICKS = MARKER_COUNT;
/**
 * Project ticks are 0 through MAX_TICKS - 1. The limit only keeps tick values
 * safe integers; the timeline itself is as long as its audio and markers.
 */
export const MAX_TICKS = 2 ** 31 - 1;
/** Without audio or markers, the timeline shows this many ticks. */
export const EMPTY_TIMELINE_TICKS = 64 * MEASURE_TICKS;

/** Maps project ticks to source samples. `shift` is in ticks and moves tick 0 within the source. */
export interface TimeBase {
  readonly bpm: number;
  readonly shift: number;
  readonly sampleRate: number;
}

/** Source samples per tick; rejects a time base that cannot map ticks to samples. */
export function samplesPerTick(base: TimeBase): number {
  if (!(Number.isFinite(base.bpm) && base.bpm > 0))
    throw new RangeError('Tempo must be a positive number');
  if (!(Number.isFinite(base.sampleRate) && base.sampleRate > 0))
    throw new RangeError('Sample rate must be a positive number');
  if (!Number.isFinite(base.shift)) throw new RangeError('Shift must be finite');
  return (base.sampleRate * 60) / (base.bpm * TICKS_PER_BEAT);
}

/** Fractional sample position, for drawing. */
export function tickToSample(tick: number, base: TimeBase): number {
  if (!Number.isFinite(tick)) throw new RangeError('Tick must be finite');
  return (tick + base.shift) * samplesPerTick(base);
}

/** Integer sample position for preview and export. */
export function tickToSampleExport(tick: number, base: TimeBase): number {
  return Math.trunc(tickToSample(tick, base));
}

/** Fractional tick position, for drawing. */
export function sampleToTick(sample: number, base: TimeBase): number {
  if (!Number.isFinite(sample)) throw new RangeError('Sample must be finite');
  return sample / samplesPerTick(base) - base.shift;
}

/**
 * Nearest tick to a playhead sample position, clamped to the marker map.
 * This maps the playhead to the marker under it.
 */
export function sampleToTickNearest(sample: number, base: TimeBase): number {
  return Math.max(0, Math.min(MAX_TICKS - 1, Math.round(sampleToTick(sample, base))));
}

/**
 * A marker must be a whole tick on the marker map. With audio, its export
 * position must lie inside the source; a marker exactly at the source end is
 * allowed and exports an empty slice.
 */
export function markerTickAllowed(
  tick: number,
  audio: { readonly base: TimeBase; readonly length: number } | null,
): boolean {
  if (!Number.isInteger(tick) || tick < 0 || tick >= MAX_TICKS) return false;
  if (!audio) return true;
  const sample = tickToSampleExport(tick, audio.base);
  return sample >= 0 && sample <= audio.length;
}

/**
 * Break-point placement: with Snap on, a placed marker aligns to the nearest
 * multiple of `grid`; holding Alt (`bypass`) drops it at the exact position.
 * Every result is a whole tick clamped into [0, MAX_TICKS). A non-integer or
 * non-positive grid falls back to the unsnapped tick.
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
