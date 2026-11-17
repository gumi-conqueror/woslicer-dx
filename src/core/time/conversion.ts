import { finite, positive } from '../foundation/contracts.js';
export interface Timebase {
  readonly tempo: number;
  readonly sampleRate: number;
  readonly shift: number;
}
function factor(base: Timebase): number {
  positive(base.tempo, 'tempo');
  positive(base.sampleRate, 'sample rate');
  finite(base.shift, 'shift');
  return (base.sampleRate * 60) / (base.tempo * 48);
}
export function tickToSample(tick: number, base: Timebase): number {
  return (finite(tick, 'tick') + base.shift) * factor(base);
}
export function exportSample(tick: number, base: Timebase): number {
  return Math.trunc(tickToSample(tick, base));
}
export function sampleToTick(sample: number, base: Timebase): number {
  return finite(sample, 'sample') / factor(base) - base.shift;
}
export function canPlaceMarker(tick: number, length: number, base: Timebase): boolean {
  if (!Number.isInteger(length) || length < 0) throw new RangeError('Invalid source length');
  if (!Number.isInteger(tick) || tick < 0 || tick > 49151) return false;
  const sample = exportSample(tick, base);
  return sample >= 0 && sample <= length;
}
