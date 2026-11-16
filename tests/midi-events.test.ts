import test from 'node:test';
import assert from 'node:assert/strict';
import { pairTrack } from '../src/core/notes/pairing.js';
import type { TrackEvent } from '../src/core/notes/pairing.js';
import { recordingSmf } from '../src/core/notes/recording-smf.js';
test('pitch-only pairing, first velocity, zero-velocity off, post-pair channel filter', () => {
  const events: TrackEvent[] = [
    { kind: 'on', tick: 20, channel: 1, pitch: 67, velocity: 90 },
    { kind: 'on', tick: 30, channel: 2, pitch: 67, velocity: 40 },
    { kind: 'on', tick: 80, channel: 2, pitch: 67, velocity: 0 },
    { kind: 'off', tick: 90, channel: 1, pitch: 60, velocity: 0 },
    { kind: 'on', tick: 100, channel: 1, pitch: 61, velocity: 30 },
    { kind: 'bend', tick: 40, channel: 3, value: 123 },
  ];
  assert.deepEqual(pairTrack(events).notes, [
    { onset: 20, duration: 60, pitch: 67, velocity: 90, channel: 1 },
  ]);
  const filtered = pairTrack(events, new Set([2]));
  assert.equal(filtered.notes.length, 0);
  assert.equal(filtered.pairedCount, 1);
  assert.equal(filtered.auxiliary.length, 1);
});
test('chronological onset and established ties', () => {
  const events: TrackEvent[] = [
    { kind: 'on', tick: 0, channel: 1, pitch: 60, velocity: 90 },
    { kind: 'on', tick: 20, channel: 2, pitch: 62, velocity: 90 },
    { kind: 'off', tick: 30, channel: 2, pitch: 62, velocity: 0 },
    { kind: 'off', tick: 90, channel: 1, pitch: 60, velocity: 0 },
  ];
  assert.deepEqual(
    pairTrack(events).notes.map((n) => n.onset),
    [0, 20],
  );
  const result = pairTrack(events, new Set());
  assert.equal(result.pairedCount, 2);
  assert.equal(result.notes.length, 0);
});
test('exact format-1 SMF bytes, own onset before end, stable simultaneous order', () => {
  const bytes = recordingSmf([{ onset: -0.5, duration: 0.9, pitch: 200, velocity: 0 }], 480);
  assert.deepEqual(
    [...bytes],
    [
      77, 84, 104, 100, 0, 0, 0, 6, 0, 1, 0, 2, 1, 224, 77, 84, 114, 107, 0, 0, 0, 4, 0, 255, 47, 0,
      77, 84, 114, 107, 0, 0, 0, 12, 0, 144, 127, 1, 0, 128, 127, 0, 0, 255, 47, 0,
    ],
  );
  const ties = recordingSmf(
    [
      { onset: 10, duration: 0, pitch: 60, velocity: 50 },
      { onset: 10, duration: 0, pitch: 61, velocity: 70 },
    ],
    480,
  );
  assert.deepEqual(
    [...ties.slice(34)],
    [10, 144, 60, 50, 0, 128, 60, 0, 0, 144, 61, 70, 0, 128, 61, 0, 0, 255, 47, 0],
  );
  assert.throws(() => recordingSmf([], 0));
});
