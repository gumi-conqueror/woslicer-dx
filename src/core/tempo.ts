/**
 * Tempo estimate of a whole piece of audio, for presetting the BPM of a new
 * project. It finds the strongest beat period of an onset envelope.
 */

/** Envelope frames per second: one frame every 4 ms. */
const ENVELOPE_RATE = 250;
/** A level rise in one frame below this (in natural-log energy, +28 %) is not an onset. */
const MIN_RISE = 0.25;
/** The tempo range that the estimate searches. */
const MIN_BPM = 60;
const MAX_BPM = 240;
/** At most this much audio is analyzed; tempo seldom changes the estimate after it. */
const MAX_SECONDS = 120;
/** The best beat must stand out this much above the average periodicity of the range. */
const MIN_CLARITY = 1.5;
/** Tempi far from this one score lower, so a half or double tempo loses to it. */
const PREFERRED_BPM = 150;
const PREFERENCE_OCTAVES = 0.75;

/**
 * The onset envelope: how much the level of the high-passed signal rises in
 * each frame, with the local average removed.
 */
function onsetEnvelope(channels: readonly ArrayLike<number>[], sampleRate: number, length: number) {
  const hop = sampleRate / ENVELOPE_RATE;
  const frames = Math.floor(Math.min(length, MAX_SECONDS * sampleRate) / hop);
  const energy = new Float64Array(frames);
  const previous = channels.map((channel) => channel[0] ?? 0);
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    const end = Math.floor((frame + 1) * hop);
    for (let index = Math.floor(frame * hop); index < end; index++)
      for (const [channel, data] of channels.entries()) {
        const sample = data[index] ?? 0;
        // A first difference passes transients and drops steady low tones.
        const difference = sample - (previous[channel] ?? 0);
        previous[channel] = sample;
        sum += difference * difference;
      }
    energy[frame] = Math.log1p(sum / hop);
  }
  // Small rises are ripple of steady sounds, such as a tone whose period does
  // not divide the frame; onsets rise much faster.
  const rise = new Float64Array(frames);
  for (let frame = 1; frame < frames; frame++)
    rise[frame] = Math.max(0, (energy[frame] ?? 0) - (energy[frame - 1] ?? 0) - MIN_RISE);
  // Subtract a 0.5 s running mean so that loud passages do not dominate.
  const window = ENVELOPE_RATE / 2;
  const envelope = new Float64Array(frames);
  let sum = 0;
  for (let frame = 0; frame < frames; frame++) {
    sum += rise[frame] ?? 0;
    if (frame >= window) sum -= rise[frame - window] ?? 0;
    envelope[frame] = Math.max(0, (rise[frame] ?? 0) - sum / Math.min(frame + 1, window));
  }
  return envelope;
}

/** Estimates the tempo in BPM, or returns null when the audio has no clear beat. */
export function estimateTempo(
  channels: readonly ArrayLike<number>[],
  sampleRate: number,
  length: number,
): number | null {
  const envelope = onsetEnvelope(channels, sampleRate, length);
  const correlations = new Map<number, number>();
  // Autocorrelation of the envelope at a whole-frame lag, computed once per lag.
  function correlation(lag: number): number {
    const cached = correlations.get(lag);
    if (cached !== undefined) return cached;
    let sum = 0;
    for (let frame = lag; frame < envelope.length; frame++)
      sum += (envelope[frame] ?? 0) * (envelope[frame - lag] ?? 0);
    const value = sum / Math.max(1, envelope.length - lag);
    correlations.set(lag, value);
    return value;
  }
  // A fractional lag interpolates between the two whole lags around it.
  function at(lag: number): number {
    const low = Math.floor(lag);
    return correlation(low) + (correlation(low + 1) - correlation(low)) * (lag - low);
  }
  /** How well the beat period and its multiples line up with onsets. */
  function periodicity(bpm: number, multiples: number): number {
    const period = (60 * ENVELOPE_RATE) / bpm;
    let sum = 0;
    for (let multiple = 1; multiple <= multiples; multiple++) sum += at(period * multiple);
    return sum / multiples;
  }
  function score(bpm: number, multiples: number): number {
    const octaves = Math.log2(bpm / PREFERRED_BPM) / PREFERENCE_OCTAVES;
    return periodicity(bpm, multiples) * Math.exp(-0.5 * octaves * octaves);
  }
  if (envelope.length < (8 * 60 * ENVELOPE_RATE) / MIN_BPM) return null;
  let best = 0,
    bestScore = 0,
    total = 0,
    count = 0;
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += 0.5) {
    total += periodicity(bpm, 4);
    count++;
    const value = score(bpm, 4);
    if (value > bestScore) [best, bestScore] = [bpm, value];
  }
  // Audio without a beat, such as a steady tone, has no period that stands out.
  if (bestScore <= 0 || periodicity(best, 4) < MIN_CLARITY * (total / count)) return null;
  // Refine with more multiples: a small period error grows with each multiple.
  let refined = best,
    refinedScore = 0;
  for (let bpm = best - 1; bpm <= best + 1; bpm += 0.01) {
    const value = score(bpm, 8);
    if (value > refinedScore) [refined, refinedScore] = [bpm, value];
  }
  // Tempi are usually whole numbers; otherwise keep one decimal.
  const whole = Math.round(refined);
  return Math.abs(refined - whole) <= 0.15 ? whole : Math.round(refined * 10) / 10;
}
