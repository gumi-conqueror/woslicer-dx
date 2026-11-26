import { expect, test } from 'vitest';
import { sliceFileName, sliceRanges } from '../../src/core/slices';

// 120 BPM at 48 kHz: 500 frames per tick.
const base = { bpm: 120, shift: 0, sampleRate: 48000 };

test('a slice runs from its marker to the next marker or the source end', () => {
  expect(sliceRanges([96, 0, 48], base, 60000)).toEqual({
    ranges: [
      { index: 0, tick: 0, start: 0, end: 24000 },
      { index: 1, tick: 48, start: 24000, end: 48000 },
      { index: 2, tick: 96, start: 48000, end: 60000 },
    ],
    skipped: 0,
  });
});

test('a marker at the source end gives an empty slice', () => {
  expect(sliceRanges([0, 96], base, 48000).ranges[1]).toEqual({
    index: 1,
    tick: 96,
    start: 48000,
    end: 48000,
  });
});

test('a marker beyond the source end has no slice but keeps its number', () => {
  const { ranges, skipped } = sliceRanges([0, 120, 140], base, 48000);
  expect(ranges).toEqual([{ index: 0, tick: 0, start: 0, end: 60000 }]);
  expect(skipped).toBe(2);
});

test('slice files are numbered with three digits', () => {
  expect([0, 7, 123, 1000].map((index) => sliceFileName('kick', index))).toEqual([
    'kick_000.wav',
    'kick_007.wav',
    'kick_123.wav',
    'kick_1000.wav',
  ]);
});
