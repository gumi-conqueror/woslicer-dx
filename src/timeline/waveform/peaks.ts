// Adapted from waveform-playlist. Copyright (c) 2015 Naomi.
// MIT license: LICENSE. Credits: NOTICE.
export interface Peak {
  readonly min: number;
  readonly max: number;
}
export interface BarRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export function aggregatePeaks(
  data: Int8Array | Int16Array,
  bits: 8 | 16,
  start: number,
  end: number,
): Peak | null {
  if (
    data.length % 2 ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    (bits !== 8 && bits !== 16)
  )
    throw new RangeError('Invalid peak range');
  if (start >= end || start * 2 + 1 >= data.length) return null;
  const scale = 2 ** (bits - 1);
  let min = Infinity,
    max = -Infinity;
  for (let p = start; p < end && p * 2 + 1 < data.length; p++) {
    const low = data[p * 2],
      high = data[p * 2 + 1];
    if (low === undefined || high === undefined || low > high || low < -scale || high >= scale)
      throw new RangeError('Invalid peak pair');
    min = Math.min(min, low / scale);
    max = Math.max(max, high / scale);
  }
  return { min, max };
}
export function scalePeakByGain(peak: Peak, gain: number): Peak {
  if (gain === 1 || !Number.isFinite(gain)) return peak;
  const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
  return { min: clamp(peak.min * Math.abs(gain)), max: clamp(peak.max * Math.abs(gain)) };
}
export function peakRect(
  x: number,
  width: number,
  baseline: number,
  halfHeight: number,
  peak: Peak,
): BarRect {
  return {
    x,
    y: baseline - peak.max * halfHeight,
    width,
    height: (peak.max - peak.min) * halfHeight,
  };
}
export function samplePeak(samples: Float32Array, start: number, end: number): Peak | null {
  if (!samples.length || end <= 0 || start >= samples.length || start >= end) return null;
  const begin = Math.max(0, Math.ceil(start)),
    limit = Math.min(samples.length, Math.ceil(end));
  // Include the signal at both pixel edges. Sample-only bins leave gaps where
  // the line crosses a pixel boundary between two source samples.
  const left = interpolateSample(samples, start),
    right = interpolateSample(samples, end);
  let min = Math.min(left, right),
    max = Math.max(left, right);
  for (let i = begin; i < limit; i++) {
    const value = samples[i];
    if (value === undefined || !Number.isFinite(value))
      throw new RangeError('Invalid source sample');
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

function interpolateSample(samples: Float32Array, position: number): number {
  const clamped = Math.max(0, Math.min(samples.length - 1, position));
  const index = Math.floor(clamped),
    fraction = clamped - index;
  const left = samples[index],
    right = samples[Math.min(index + 1, samples.length - 1)];
  if (
    left === undefined ||
    right === undefined ||
    !Number.isFinite(left) ||
    !Number.isFinite(right)
  )
    throw new RangeError('Invalid source sample');
  return left + (right - left) * fraction;
}
