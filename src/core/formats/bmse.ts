/**
 * BMSE clipboard text ("BMSE ClipBoard Object Data Format").
 *
 * After the format-name line, each object is one line: a three-character
 * column code, the position as 8 decimal digits of 48-per-beat ticks, and a
 * decimal value, then CRLF. Marker exports end with a NUL byte.
 */

import { MAX_TICKS, TICKS_PER_BEAT } from '../timebase.js';
import { markerNextId, stepId, validId, type NumberingMode } from './numbering.js';

const FORMAT_NAME = 'BMSE ClipBoard Object Data Format';

function row(column: string, position: number, value: number): string {
  if (!Number.isSafeInteger(position) || position < 0)
    throw new RangeError('Invalid clipboard position');
  return column + String(position).padStart(8, '0') + String(value) + '\r\n';
}

/** Converts a note position at `resolution` ticks per beat to clipboard ticks. */
function clipboardTick(tick: number, resolution: number): number {
  if (!Number.isFinite(tick) || tick < 0 || !Number.isFinite(resolution) || resolution <= 0)
    throw new RangeError('Invalid note position/timebase');
  return Math.trunc((tick * TICKS_PER_BEAT) / resolution);
}

/**
 * Markers in the `101` column, numbered from `startNumber`. Ticks outside the
 * marker map are dropped. In restricted numbering, a start number that the
 * rule skips moves to the next allowed number.
 */
export function buildBmseClipboard(
  ticks: readonly number[],
  options: { startNumber: number; numbering: NumberingMode },
): string {
  const sorted = [...ticks].sort((a, b) => a - b).filter((t) => t >= 0 && t < MAX_TICKS);
  let n = markerNextId(stepId(options.startNumber, -1, 'extended'), options.numbering);
  let out = FORMAT_NAME + '\r\n';
  for (const tick of sorted) {
    out += row('101', tick, n);
    n = markerNextId(n, options.numbering);
  }
  return out + '\0';
}

/**
 * Reads marker ticks. Tolerates CRLF or LF and requires the exact format name.
 * Lines shorter than 11 characters or with a non-numeric tick are reported in
 * `invalidLines` (1-based, excluding the format name) and skipped.
 */
export function parseBmseClipboard(text: string): { ticks: number[]; invalidLines: number[] } {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== FORMAT_NAME) throw new Error(`clipboard does not start with "${FORMAT_NAME}"`);
  const ticks: number[] = [];
  const invalidLines: number[] = [];
  for (let i = 1; i < lines.length - 1; i++) {
    const line = lines[i];
    const tick = Number.parseInt(line.slice(3, 11), 10);
    if (line.length >= 11 && Number.isInteger(tick) && tick >= 0 && tick < MAX_TICKS)
      ticks.push(tick);
    else invalidLines.push(i);
  }
  return { ticks, invalidLines };
}

/** BMHelper recording cut positions in the `011` column. */
export function recordingCutText(onsets: readonly number[], resolution: number): string {
  return (
    FORMAT_NAME + '\r\n' + onsets.map((t) => row('011', clipboardTick(t, resolution), 1)).join('')
  );
}

export interface SequenceEntry {
  readonly onset: number;
  readonly definitionId: number;
}

/** Source notes in BGM lanes `101`, `102`, …: simultaneous notes take the next lane. */
export function sourceSequenceText(notes: readonly SequenceEntry[], resolution: number): string {
  const lanes = new Map<number, number>();
  return (
    FORMAT_NAME +
    '\r\n' +
    notes
      .map((note) => {
        const tick = clipboardTick(note.onset, resolution);
        const lane = (lanes.get(tick) ?? 0) + 1;
        lanes.set(tick, lane);
        return row('1' + String(lane).padStart(2, '0'), tick, validId(note.definitionId));
      })
      .join('')
  );
}
