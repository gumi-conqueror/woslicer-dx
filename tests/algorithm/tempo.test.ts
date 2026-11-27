import { describe, expect, it } from 'vitest';
import { estimateTempo } from '../../src/core/tempo';

const RATE = 48000;
/** A beat pattern: a loud 15 ms noise burst on each beat, and quieter ones in between. */
function clicks(bpm: number, seconds: number, between = 0): Float32Array {
  const data = new Float32Array(RATE * seconds);
  let seed = 1;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 1073741824 - 1;
  };
  const burst = (start: number, level: number) => {
    for (let index = 0; index < 0.015 * RATE; index++)
      data[Math.round(start) + index] = level * noise() * Math.exp(-index / (0.004 * RATE));
  };
  const beat = (60 / bpm) * RATE;
  for (let time = 0; time + 0.02 * RATE < data.length; time += beat) {
    burst(time, 20000);
    if (between) burst(time + beat / 2, between);
  }
  return data;
}

describe('tempo estimate', () => {
  it.each([150, 128, 174, 90, 200])('finds %d BPM in a click track', (bpm) => {
    const data = clicks(bpm, 40);
    expect(estimateTempo([data], RATE, data.length)).toBe(bpm);
  });
  it('keeps the beat when quieter off-beat hits fall between the beats', () => {
    const data = clicks(140, 40, 6000);
    expect(estimateTempo([data], RATE, data.length)).toBe(140);
  });
  it('finds a tempo with a decimal', () => {
    const data = clicks(133.5, 60);
    expect(estimateTempo([data], RATE, data.length)).toBe(133.5);
  });
  it('returns no tempo for silence, a steady tone or a clip that is too short', () => {
    expect(estimateTempo([new Float32Array(RATE * 20)], RATE, RATE * 20)).toBeNull();
    // A 637 Hz tone: its period does not divide the 4 ms envelope frame.
    const tone = Float32Array.from({ length: RATE * 20 }, (_, i) => Math.sin(i / 12) * 16000);
    expect(estimateTempo([tone], RATE, tone.length)).toBeNull();
    const short = clicks(150, 4);
    expect(estimateTempo([short], RATE, short.length)).toBeNull();
  });
});
