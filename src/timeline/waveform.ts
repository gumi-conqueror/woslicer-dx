import { peakRange, type PeakCache } from '../core/peaks';
import { BAND_DRAW_MIN_ABS } from '../core/bands';
import { tickToSample, type TimeBase } from '../core/timebase';
import { drawWaveform } from './waveform/canvas';
import { FULL_SCALE } from '../core/audio/pcm';

export interface WaveViewport {
  width: number;
  dpr: number;
  scrollTick: number;
  pxPerTick: number;
  timeBase: TimeBase;
}
/** One channel's band of the canvas: its center line and the height from center to edge. */
export interface ChannelArea {
  center: number;
  halfHeight: number;
}

/**
 * Draws one channel on the timeline canvas. `samples` are the decoded floats in
 * -1..1 (`floatData`), so drawing never converts a whole channel on the main thread.
 */
export function drawWaveLane(
  context: CanvasRenderingContext2D,
  view: WaveViewport,
  samples: Float32Array,
  area: ChannelArea,
  colors: { outer: string; rms: string },
  rmsVisible: boolean,
): void {
  const { center, halfHeight } = area;
  if (!samples.length || view.width <= 0 || halfHeight <= 0) return;
  drawWaveform(
    context,
    [samples],
    {
      timebase: view.timeBase,
      scroll: view.scrollTick,
      scale: view.pxPerTick,
      width: view.width,
      height: halfHeight * 2,
      dpr: view.dpr,
    },
    { ...colors, detail: colors.outer },
    rmsVisible,
    center - halfHeight,
  );
}

/** Interpolated band envelopes with silence gaps; cache values stay source-time. */
export function drawBandEnvelope(
  context: CanvasRenderingContext2D,
  view: WaveViewport,
  band: { peaks: PeakCache; length: number; color: string; dash: readonly number[] },
  area: ChannelArea,
): void {
  const { peaks, length, color, dash } = band;
  const { center, halfHeight } = area;
  const base = peaks.levels[0];
  if (!base) return;
  context.strokeStyle = color;
  context.lineWidth = 1 / view.dpr;
  context.setLineDash([...dash]);
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
      const y =
        (Math.floor((center - (value / FULL_SCALE) * halfHeight) * view.dpr) + 0.5) / view.dpr;
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
