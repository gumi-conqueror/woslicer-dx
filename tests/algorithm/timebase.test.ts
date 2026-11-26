import { describe, expect, test } from 'vitest';
import {
  MAX_TICKS,
  markerTickAllowed,
  resolveBreakpointTick,
  sampleToTick,
  sampleToTickNearest,
  samplesPerTick,
  tickToSample,
  tickToSampleExport,
  type TimeBase,
} from '../../src/core/timebase';

// 96 BPM at 32 kHz: 32000 × 60 / (96 × 48) = 416⅔ samples per tick.
const base: TimeBase = { bpm: 96, sampleRate: 32000, shift: 0 };
// 120 BPM at 48 kHz: exactly 500 samples per tick.
const even: TimeBase = { bpm: 120, sampleRate: 48000, shift: 0 };

describe('tick and sample conversion', () => {
  test('one beat of 48 ticks spans 60 / BPM seconds', () => {
    expect(tickToSample(48, base)).toBe(20000);
    expect(sampleToTick(20000, base)).toBe(48);
    expect(samplesPerTick(even)).toBe(500);
  });

  test('drawing keeps fractional positions', () => {
    expect(tickToSample(0.5, even)).toBe(250);
    expect(sampleToTick(250, even)).toBe(0.5);
  });

  test('export truncates toward zero, including before the source start', () => {
    expect(tickToSampleExport(1, base)).toBe(416);
    expect(tickToSampleExport(0, { ...base, shift: -1 })).toBe(-416);
  });

  test('shift moves tick 0 by whole ticks', () => {
    expect(tickToSample(0, { ...even, shift: 2 })).toBe(1000);
    expect(sampleToTick(1000, { ...even, shift: 2 })).toBe(0);
  });

  test.each([
    { bpm: 0, sampleRate: 48000, shift: 0 },
    { bpm: 120, sampleRate: 0, shift: 0 },
    { bpm: 120, sampleRate: 48000, shift: Infinity },
  ])('rejects a time base that cannot map ticks: %o', (invalid) => {
    expect(() => tickToSample(1, invalid)).toThrow(RangeError);
  });
});

describe('nearest tick under the playhead', () => {
  test('rounds half a tick up', () => {
    expect(sampleToTickNearest(749, even)).toBe(1);
    expect(sampleToTickNearest(750, even)).toBe(2);
  });

  test('clamps to the marker map', () => {
    expect(sampleToTickNearest(-99999, even)).toBe(0);
    expect(sampleToTickNearest(Number.MAX_SAFE_INTEGER, even)).toBe(MAX_TICKS - 1);
    expect(sampleToTickNearest(0, { ...even, shift: -48 })).toBe(48);
  });

  test.each([
    { bpm: 120, shift: 0, sampleRate: 48000 },
    { bpm: 185, shift: 0, sampleRate: 44100 },
    { bpm: 100, shift: -48, sampleRate: 48000 },
    { bpm: 200, shift: 96, sampleRate: 44100 },
  ])('returns the tick whose export position it is given at $bpm BPM', (timeBase) => {
    const misses = [];
    for (let tick = 0; tick <= 1000; tick += 7)
      if (sampleToTickNearest(tickToSampleExport(tick, timeBase), timeBase) !== tick)
        misses.push(tick);
    expect(misses).toEqual([]);
  });
});

describe('marker positions', () => {
  test('without audio, every whole tick of the map is allowed', () => {
    expect([0, MAX_TICKS - 1].map((tick) => markerTickAllowed(tick, null))).toEqual([true, true]);
    expect([-1, 1.5, MAX_TICKS].map((tick) => markerTickAllowed(tick, null))).toEqual([
      false,
      false,
      false,
    ]);
  });

  test('with audio, the source end is allowed and later ticks are not', () => {
    const audio = { base, length: 20000 };
    expect(markerTickAllowed(48, audio)).toBe(true);
    expect(markerTickAllowed(49, audio)).toBe(false);
  });

  test('with audio, a tick before the source start is not allowed', () => {
    expect(markerTickAllowed(0, { base: { ...base, shift: -1 }, length: 20000 })).toBe(false);
  });
});

describe('break-point placement', () => {
  test('snaps to the nearest grid multiple', () => {
    expect(resolveBreakpointTick(37, true, 24, false)).toBe(48);
    expect(resolveBreakpointTick(35, true, 24, false)).toBe(24);
  });

  test('keeps the exact tick when snap is off or bypassed', () => {
    expect(resolveBreakpointTick(37.4, false, 24, false)).toBe(37);
    expect(resolveBreakpointTick(37, true, 24, true)).toBe(37);
  });

  test('ignores an unusable grid', () => {
    expect(resolveBreakpointTick(37, true, 0, false)).toBe(37);
    expect(resolveBreakpointTick(37, true, 2.5, false)).toBe(37);
  });

  test('clamps to the marker map', () => {
    expect(resolveBreakpointTick(-5, true, 24, false)).toBe(0);
    expect(resolveBreakpointTick(MAX_TICKS + 10, false, 24, false)).toBe(MAX_TICKS - 1);
  });
});
