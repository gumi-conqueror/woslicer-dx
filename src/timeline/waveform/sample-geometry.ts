import type { Timebase } from '../../core/time/conversion.js';
import { sampleToTick, tickToSample } from '../../core/time/conversion.js';
export interface WaveView {
  readonly timebase: Timebase;
  readonly scroll: number;
  readonly scale: number;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}
export function validateView(view: WaveView): void {
  if (
    ![view.scroll, view.scale, view.width, view.height, view.dpr].every(Number.isFinite) ||
    view.scroll < 0 ||
    view.scale <= 0 ||
    view.width < 0 ||
    view.height < 0 ||
    view.dpr <= 0
  )
    throw new RangeError('Invalid waveform view');
  tickToSample(0, view.timebase);
}
export function sampleX(sample: number, view: WaveView): number {
  return (sampleToTick(sample, view.timebase) - view.scroll) * view.scale;
}
export function xSample(x: number, view: WaveView): number {
  return tickToSample(view.scroll + x / view.scale, view.timebase);
}
export interface SamplePoint {
  readonly sample: number;
  readonly x: number;
  readonly y: number;
}
export function samplePoints(
  samples: Float32Array,
  view: WaveView,
  baseline: number,
  halfHeight: number,
): SamplePoint[] {
  validateView(view);
  if (!samples.length || view.width === 0) return [];
  // Keep adjacent samples so a viewport between two samples still shows their segment.
  const begin = Math.max(0, Math.floor(xSample(0, view))),
    end = Math.min(samples.length - 1, Math.ceil(xSample(view.width, view)));
  const points: SamplePoint[] = [];
  for (let i = begin; i <= end; i++) {
    const value = samples[i];
    if (value === undefined || !Number.isFinite(value)) throw new RangeError('Invalid sample');
    points.push({ sample: i, x: sampleX(i, view), y: baseline - value * halfHeight });
  }
  return points;
}
