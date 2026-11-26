import { peakRange, type PeakCache } from '../core/peaks';
import { BAND_DRAW_MIN_ABS } from '../core/bands';
import { tickToSample, type TimeBase } from '../core/timebase';
import { drawWaveform } from './waveform/canvas';
import type { PcmChannel } from '../core/wav';

export interface WaveViewport {
  width: number;
  dpr: number;
  scrollTick: number;
  pxPerTick: number;
  timeBase: TimeBase;
}
// Source buffers are immutable after decoding. Weak keys release converted data with the source.
const drawingSamples = new WeakMap<PcmChannel, Float32Array>();

/** Draw one lane on the existing timeline canvas. */
export function drawWaveLane(
  context: CanvasRenderingContext2D,
  view: WaveViewport,
  data: PcmChannel,
  mid: number,
  half: number,
  colors: { outer: string; rms: string },
  rmsVisible: boolean,
): void {
  if (!data.length || view.width <= 0 || half <= 0) return;
  let samples = drawingSamples.get(data);
  if (!samples) {
    samples = Float32Array.from(data, (value) => value / 32768);
    drawingSamples.set(data, samples);
  }
  drawWaveform(
    context,
    [samples],
    {
      timebase: view.timeBase,
      scroll: view.scrollTick,
      scale: view.pxPerTick,
      width: view.width,
      height: half * 2,
      dpr: view.dpr,
    },
    { ...colors, detail: colors.outer },
    rmsVisible,
    mid - half,
  );
}

/** Interpolated band envelopes with silence gaps; cache values stay source-time. */
export function drawBandEnvelope(
  context: CanvasRenderingContext2D,
  view: WaveViewport,
  peaks: PeakCache,
  length: number,
  mid: number,
  half: number,
  color: string,
  dash: number[],
): void {
  const base = peaks.levels[0];
  if (!base) return;
  context.strokeStyle = color;
  context.lineWidth = 1 / view.dpr;
  context.setLineDash(dash);
  for (const upper of [true, false]) {
    context.beginPath();
    let drawing = false;
    for (let column = 0; column <= Math.round(view.width * view.dpr); column++) {
      const x = (column + 0.5) / view.dpr;
      const first = tickToSample(view.scrollTick + x / view.pxPerTick, view.timeBase);
      const last = tickToSample(
        view.scrollTick + (x + 1 / view.dpr) / view.pxPerTick,
        view.timeBase,
      );
      if (last <= 0 || first >= length) {
        drawing = false;
        continue;
      }
      let value: number, loud: boolean;
      if (last - first <= base.framesPerBucket) {
        const center = (first + last) / (2 * base.framesPerBucket);
        const bucket = Math.floor(center),
          fraction = center - bucket;
        const valueAt = (index: number) =>
          base.minMax[Math.max(0, Math.min(base.buckets - 1, index)) * 2 + (upper ? 1 : 0)] ?? 0;
        const a = valueAt(bucket),
          b = valueAt(bucket + 1);
        value = a + (b - a) * fraction;
        loud = Math.max(Math.abs(a), Math.abs(b)) >= BAND_DRAW_MIN_ABS;
      } else {
        const range = peakRange(peaks, length, first, last);
        value = upper ? range.max : range.min;
        loud = Math.max(Math.abs(range.min), Math.abs(range.max)) >= BAND_DRAW_MIN_ABS;
      }
      if (!loud) {
        drawing = false;
        continue;
      }
      const y = (Math.floor((mid - (value / 32768) * half) * view.dpr) + 0.5) / view.dpr;
      if (drawing) context.lineTo(x, y);
      else {
        context.moveTo(x, y);
        drawing = true;
      }
    }
    context.stroke();
  }
  context.setLineDash([]);
}
