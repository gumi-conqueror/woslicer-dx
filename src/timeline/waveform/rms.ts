// RMS requires actual source samples, never min/max estimates.
export function rms(samples: Float32Array, start: number, end: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    throw new RangeError('Invalid RMS interval');
  const begin = Math.max(0, Math.ceil(start)),
    limit = Math.min(samples.length, Math.ceil(end));
  if (begin >= limit) return 0;
  let sum = 0;
  for (let i = begin; i < limit; i++) {
    const value = samples[i];
    if (value === undefined || !Number.isFinite(value)) throw new RangeError('Invalid RMS sample');
    sum += value * value;
  }
  return Math.sqrt(sum / (limit - begin));
}
