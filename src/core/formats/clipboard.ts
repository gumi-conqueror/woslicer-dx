import { validId, markerNextId } from './numbering.js';
export const CLIPBOARD_FORMAT = 'BMSE ClipBoard Object Data Format';
function position(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Invalid clipboard position');
  return String(value).padStart(8, '0');
}
function converted(tick: number, resolution: number): number {
  if (!Number.isFinite(tick) || tick < 0 || !Number.isFinite(resolution) || resolution <= 0)
    throw new RangeError('Invalid note position/timebase');
  return Math.trunc((tick * 48) / resolution);
}
export function markerClipboard(
  ticks: readonly number[],
  first: number,
  restricted: boolean,
): string {
  let id = validId(first);
  let result = CLIPBOARD_FORMAT + '\r\n';
  const ordered = ticks
    .filter((t) => Number.isInteger(t) && t >= 0 && t < 49152)
    .slice()
    .sort((a, b) => a - b);
  for (const tick of ordered) {
    result += '101' + position(tick) + id + '\r\n';
    id = markerNextId(id, restricted);
  }
  return result + '\0';
}
export function recordingCutText(onsets: readonly number[], resolution: number): string {
  return (
    CLIPBOARD_FORMAT +
    '\r\n' +
    onsets.map((t) => '011' + position(converted(t, resolution)) + '1\r\n').join('')
  );
}
export interface SequenceEntry {
  readonly onset: number;
  readonly definitionId: number;
}
export function sourceSequenceText(notes: readonly SequenceEntry[], resolution: number): string {
  const lanes = new Map<number, number>();
  return (
    CLIPBOARD_FORMAT +
    '\r\n' +
    notes
      .map((note) => {
        const tick = converted(note.onset, resolution);
        const lane = (lanes.get(tick) ?? 0) + 1;
        lanes.set(tick, lane);
        return (
          '1' + String(lane).padStart(2, '0') + position(tick) + validId(note.definitionId) + '\r\n'
        );
      })
      .join('')
  );
}
