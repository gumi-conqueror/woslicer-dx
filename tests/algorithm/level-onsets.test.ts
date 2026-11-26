import { expect, test } from 'vitest';
import { suggestOnsets } from '../../src/core/audio/onsets';

// 60 BPM at 480 Hz: 10 samples per tick, so a 48-tick grid cell is 480 samples.
const options = { timebase: { bpm: 60, sampleRate: 480, shift: 0 }, grid: 48 };
const rise = () => new Int16Array(1920).fill(1000, 960);

test.each([0, 100])('finds no onset in a constant signal at level %d', (level) => {
  expect(suggestOnsets({ ...options, channels: [new Int16Array(1920).fill(level)] })).toEqual([]);
});

test('returns the grid tick where the level rises', () => {
  expect(suggestOnsets({ ...options, channels: [rise()] })).toEqual([96]);
});

test('does not change its input', () => {
  const signal = rise();
  const before = signal.slice();
  suggestOnsets({ ...options, channels: [signal] });
  expect(signal).toEqual(before);
});

test('reads only the first channel', () => {
  expect(suggestOnsets({ ...options, channels: [new Int16Array(1920), rise()] })).toEqual([]);
});

test.each([0, 0.001])('rejects a grid of %d ticks', (grid) => {
  expect(() => suggestOnsets({ ...options, grid, channels: [new Int16Array(1920)] })).toThrow();
});

test('requires a level ratio strictly above 1.5 and normalizes a clipped window', () => {
  // 60 BPM at 48 Hz: one sample per tick.
  const timebase = { bpm: 60, sampleRate: 48, shift: 0 };
  expect(
    suggestOnsets({ timebase, grid: 2, channels: [Int16Array.from([100, 100, 150, 150, 226])] }),
  ).toEqual([4]);
  expect(suggestOnsets({ timebase, grid: 2, channels: [new Int16Array(5).fill(100)] })).toEqual([]);
});
