import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestOnsets } from '../src/core/audio/onsets.js';

const options = { timebase: { tempo: 60, sampleRate: 480, shift: 0 }, grid: 48 };
for (const level of [0, 100]) {
  test(`RMS detector finds no onset in a constant signal at level ${level}`, () => {
    assert.deepEqual(
      suggestOnsets({ ...options, channels: [new Int16Array(1920).fill(level)] }),
      [],
    );
  });
}
test('RMS detector returns the isolated rise without mutating its input', () => {
  const rise = new Int16Array(1920);
  rise.fill(1000, 960);
  const before = rise.slice();
  assert.deepEqual(suggestOnsets({ ...options, channels: [rise] }), [96]);
  assert.deepEqual(rise, before);
  assert.deepEqual(suggestOnsets({ ...options, channels: [rise] }), [96]);
});
test('RMS detector uses the first channel', () => {
  const rise = new Int16Array(1920);
  rise.fill(1000, 960);
  assert.deepEqual(suggestOnsets({ ...options, channels: [new Int16Array(1920), rise] }), []);
});
for (const grid of [0, 0.001]) {
  test(`RMS detector rejects a grid of ${grid}`, () => {
    assert.throws(() => suggestOnsets({ ...options, grid, channels: [new Int16Array(1920)] }));
  });
}
test('RMS detector requires a rise strictly above 1.5 and normalizes a clipped endpoint', () => {
  const timebase = { tempo: 60, sampleRate: 48, shift: 0 };
  const signal = Int16Array.from([100, 100, 150, 150, 226]);
  assert.deepEqual(suggestOnsets({ timebase, grid: 2, channels: [signal] }), [4]);
  assert.deepEqual(
    suggestOnsets({ timebase, grid: 2, channels: [new Int16Array(5).fill(100)] }),
    [],
  );
});
