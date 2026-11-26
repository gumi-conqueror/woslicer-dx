import { MAX_TICKS, samplesPerTick, tickToSampleExport, type TimeBase } from '../timebase.js';
import type { PcmChannel } from './pcm.js';
export interface OnsetInput {
  readonly channels: readonly PcmChannel[];
  readonly timebase: TimeBase;
  readonly grid: number;
}
// RMS of adjacent grid-length windows; clip to the source,
// normalize by actual available samples, and use zero for an empty window.
function level(channel: PcmChannel, begin: number, end: number): number {
  const start = Math.max(0, begin),
    limit = Math.min(channel.length, end);
  if (limit <= start) return 0;
  let sum = 0;
  for (let i = start; i < limit; i++) sum += (channel[i] ?? 0) ** 2;
  return Math.sqrt(sum / (limit - start));
}
export function suggestOnsets(input: OnsetInput): number[] {
  const { grid, timebase } = input;
  if (!Number.isFinite(grid) || grid <= 0) throw new RangeError('Grid must be positive');
  // Validates the time base even when the source is empty.
  const span = Math.trunc(grid * samplesPerTick(timebase));
  if (!Number.isSafeInteger(span) || span <= 0)
    throw new RangeError('Grid must span a positive sample interval');
  const channel = input.channels[0];
  if (!channel) return [];
  const result: number[] = [];
  for (let step = 1; step * grid < MAX_TICKS; step++) {
    const tick = step * grid;
    const sample = tickToSampleExport(tick, timebase);
    if (sample > channel.length) break;
    if (sample < 0) continue;
    if (level(channel, sample, sample + span) > 1.5 * level(channel, sample - span, sample))
      result.push(tick);
  }
  return result;
}
