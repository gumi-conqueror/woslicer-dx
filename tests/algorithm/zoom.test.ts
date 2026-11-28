import { test } from 'vitest';
import assert from 'node:assert/strict';
import { zoomAt } from '../../src/core/zoom.js';
test('anchor invariant, origin clamp and bounded unloaded view', () => {
  const bounds = { min: 0.01, max: 1000000 },
    initial = { scroll: 20, scale: 2 };
  const doubled = zoomAt(initial, 50, 2, bounds);
  assert.deepEqual(doubled, { scroll: 35, scale: 4 });
  assert.equal((50 - doubled.scroll) * doubled.scale, 60);
  assert.deepEqual(zoomAt(initial, 50, 0.5, bounds), { scroll: 0, scale: 1 });
  let state = initial;
  for (let i = 0; i < 1000; i++) state = zoomAt(state, 50, 1.25, bounds);
  assert.equal(state.scale, bounds.max);
  assert.ok(Number.isFinite(state.scroll));
  for (let i = 0; i < 1000; i++) state = zoomAt(state, 50, 0.8, bounds);
  assert.equal(state.scale, bounds.min);
  assert.equal(state.scroll, 0);
  assert.throws(() => zoomAt(initial, 50, 0, bounds));
});
