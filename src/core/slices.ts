import { tickToSampleExport, type TimeBase } from './timebase.js';

/** One exported slice: marker `index` in tick order, and its source frames. */
export interface SliceRange {
  readonly index: number;
  readonly tick: number;
  readonly start: number;
  readonly end: number;
}

/**
 * Splits the source at the markers. A slice runs from its marker to the next
 * marker, or to the source end. A marker beyond the source end has no slice
 * (a confirmed defect of the original tool) but keeps its number, so file
 * numbers stay equal to marker numbers. A marker exactly at the source end
 * gives an empty slice.
 */
export function sliceRanges(
  markers: readonly number[],
  base: TimeBase,
  sourceLength: number,
): { ranges: SliceRange[]; skipped: number } {
  const ticks = [...markers].sort((a, b) => a - b);
  const ranges: SliceRange[] = [];
  let skipped = 0;
  ticks.forEach((tick, index) => {
    const start = tickToSampleExport(tick, base);
    if (start > sourceLength) {
      skipped++;
      return;
    }
    const next = ticks[index + 1];
    const end = next === undefined ? sourceLength : tickToSampleExport(next, base);
    ranges.push({ index, tick, start, end });
  });
  return { ranges, skipped };
}

/** Exported slice files and `#WAV` definitions use this name. */
export function sliceFileName(baseName: string, index: number): string {
  return `${baseName}_${String(index).padStart(3, '0')}.wav`;
}
