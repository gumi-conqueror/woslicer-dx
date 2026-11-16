import type { WaveView } from './sample-geometry.js';
import { validateView, samplePoints, xSample } from './sample-geometry.js';
import { aggregatePeaks, samplePeak, peakRect } from './peaks.js';
import { rms } from './rms.js';
export interface PeakChannel {
  readonly peaks: Int8Array | Int16Array;
  readonly bits: 8 | 16;
  readonly samplesPerPeak: number;
  readonly length: number;
}
export type WaveChannel = Float32Array | PeakChannel;
export interface WaveColors {
  readonly outer: string;
  readonly rms: string;
  readonly detail: string;
}
export interface DrawingContext {
  save(): void;
  restore(): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
}
export function drawWaveform(
  context: DrawingContext,
  channels: readonly WaveChannel[],
  view: WaveView,
  colors: WaveColors,
  showRms: boolean,
  top = 0,
): void {
  validateView(view);
  if (showRms && channels.some((c) => !(c instanceof Float32Array)))
    throw new RangeError('RMS requires source samples');
  for (const channel of channels)
    if (
      !(channel instanceof Float32Array) &&
      (!Number.isInteger(channel.samplesPerPeak) ||
        channel.samplesPerPeak <= 0 ||
        !Number.isInteger(channel.length) ||
        channel.length < 0)
    )
      throw new RangeError('Invalid peak metadata');
  context.save();
  try {
    // The host owns the background. Draw on physical pixels, including at fractional DPR.
    context.setTransform(1, 0, 0, 1, 0, Math.round(top * view.dpr));
    context.lineWidth = 1;
    const width = Math.round(view.width * view.dpr);
    const height = Math.round(view.height * view.dpr);
    context.beginPath();
    context.rect(0, 0, width, height);
    context.clip();
    if (!channels.length || !view.width || !view.height) return;
    const channelHeight = height / channels.length;
    const density = xSample(1 / view.dpr, view) - xSample(0, view);
    channels.forEach((channel, index) => {
      const baseline = (index + 0.5) * channelHeight,
        half = channelHeight / 2;
      if (channel instanceof Float32Array && density <= 1) {
        const points = samplePoints(channel, view, baseline, half);
        context.strokeStyle = colors.detail;
        context.fillStyle = colors.detail;
        context.beginPath();
        points.forEach((p, i) => {
          const x = Math.floor(p.x * view.dpr) + 0.5;
          const y = Math.floor(p.y) + 0.5;
          if (i === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
          context.fillRect(x - 0.5, y - 0.5, 1, 1);
        });
        if (points.length) context.stroke();
      } else {
        for (let x = 0; x < width; x++) {
          const start = xSample(x / view.dpr, view),
            end = xSample(Math.min(view.width, (x + 1) / view.dpr), view);
          const length = channel.length;
          if (end <= 0 || start >= length) continue;
          const peak =
            channel instanceof Float32Array
              ? samplePeak(channel, start, end)
              : aggregatePeaks(
                  channel.peaks,
                  channel.bits,
                  Math.max(0, Math.floor(start / channel.samplesPerPeak)),
                  Math.ceil(Math.min(end, length) / channel.samplesPerPeak),
                );
          if (!peak) continue;
          const rect = peakRect(x, 1, baseline, half, peak);
          const y = Math.round(rect.y);
          const bottom = Math.max(y + 1, Math.round(rect.y + rect.height));
          context.fillStyle = colors.outer;
          context.fillRect(x, y, 1, bottom - y);
          if (showRms && channel instanceof Float32Array) {
            const level = rms(channel, start, end);
            context.fillStyle = colors.rms;
            // RMS stays inside the actual signed envelope and leaves its border visible.
            const upper = Math.max(y + 1, Math.round(baseline - level * half));
            const lower = Math.min(bottom - 1, Math.round(baseline + level * half));
            if (lower > upper) context.fillRect(x, upper, 1, lower - upper);
          }
        }
      }
    });
  } finally {
    context.restore();
  }
}
