import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  DEFAULT_PLAYBACK_RATE,
  PLAYBACK_RATES,
  advanceSamples,
  formatRate,
  stepPlaybackRate,
} from '../../src/core/rate.js';

test('[ steps one notch down per press through the whole ladder', () => {
  let rate = DEFAULT_PLAYBACK_RATE;
  const seen: number[] = [];
  // 3 unclamped presses walk 1.0 -> 0.75 -> 0.5 -> 0.25.
  for (let i = 0; i < 3; i++) {
    const step = stepPlaybackRate(rate, -1);
    assert.equal(step.clamped, false, `step ${i} must not clamp yet`);
    rate = step.rate;
    seen.push(rate);
  }
  assert.deepEqual(seen, [0.75, 0.5, 0.25]);
  // 4th press: clamped at the slow endpoint, no wrap-around.
  const clamped = stepPlaybackRate(rate, -1);
  assert.deepEqual(clamped, { rate: 0.25, clamped: true });
});

test('] steps one notch up and clamps at the fast endpoint without wrapping', () => {
  const step = stepPlaybackRate(DEFAULT_PLAYBACK_RATE, 1);
  assert.deepEqual(step, { rate: 1.5, clamped: false });
  const clamped = stepPlaybackRate(1.5, 1);
  assert.deepEqual(clamped, { rate: 1.5, clamped: true });
});

test('rate endpoints are symmetric in both directions', () => {
  assert.deepEqual(stepPlaybackRate(0.25, -1), { rate: 0.25, clamped: true });
  assert.deepEqual(stepPlaybackRate(0.25, 1), { rate: 0.5, clamped: false });
  assert.deepEqual(stepPlaybackRate(1.5, 1), { rate: 1.5, clamped: true });
  assert.deepEqual(stepPlaybackRate(1.5, -1), { rate: 1.0, clamped: false });
});

test('unknown current rate falls back to the default notch instead of NaN', () => {
  assert.deepEqual(stepPlaybackRate(0.9, -1), { rate: 0.75, clamped: false });
  assert.deepEqual(stepPlaybackRate(0.9, 1), { rate: 1.5, clamped: false });
});

test('formatRate renders the select labels', () => {
  assert.equal(formatRate(0.25), '0.25\u00d7');
  assert.equal(formatRate(0.5), '0.5\u00d7');
  assert.equal(formatRate(0.75), '0.75\u00d7');
  assert.equal(formatRate(1.0), '1.0\u00d7');
  assert.equal(formatRate(1.5), '1.5\u00d7');
});

const SR = 48000;

test('playback advances by elapsed seconds × rate × sample rate from its anchor', () => {
  assert.equal(advanceSamples(1000, 2, 1, SR), 97000);
  assert.equal(advanceSamples(1000, 2, 0.5, SR), 49000);
  assert.equal(advanceSamples(1000, 0, 1.5, SR), 1000);
  // Monotonic in elapsed for every rate.
  for (const rate of PLAYBACK_RATES) {
    let prev = -Infinity;
    for (let t = 0; t <= 3; t += 0.25) {
      const s = advanceSamples(0, t, rate, SR);
      assert.ok(s > prev, `rate ${rate} must advance with time`);
      prev = s;
    }
  }
});

test('slower rates advance the anchor more slowly (1.5x / 1x / 0.25x ordering)', () => {
  const elapsed = 1;
  const fast = advanceSamples(0, elapsed, 1.5, SR);
  const normal = advanceSamples(0, elapsed, 1, SR);
  const slow = advanceSamples(0, elapsed, 0.25, SR);
  assert.ok(fast > normal && normal > slow);
  assert.equal(normal, SR);
  assert.equal(slow, SR / 4);
});
