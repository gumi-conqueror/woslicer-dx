import { test } from 'vitest';
import assert from 'node:assert/strict';
import { aggregatePeaks, scalePeakByGain, samplePeak } from '../../src/timeline/waveform/peaks.js';
import { rms } from '../../src/timeline/waveform/rms.js';
import { samplePoints, sampleX } from '../../src/timeline/waveform/sample-geometry.js';
import type { WaveView } from '../../src/timeline/waveform/sample-geometry.js';
import { drawWaveform } from '../../src/timeline/waveform/canvas.js';
import type { DrawingContext } from '../../src/timeline/waveform/canvas.js';
const colors = { outer: 'blue', rms: 'red', detail: 'black' };
const base: WaveView = {
  timebase: { bpm: 60, sampleRate: 480, shift: 0 },
  scroll: 0,
  scale: 20,
  width: 100,
  height: 100,
  dpr: 1,
};
class Context implements DrawingContext {
  fillStyle = 'initial';
  strokeStyle = 'initial';
  lineWidth = 1;
  saved: string[] = [];
  rectangles: { x: number; y: number; w: number; h: number; color: string }[] = [];
  transforms: number[][] = [];
  strokes = 0;
  restored = 0;
  save() {
    this.saved.push(this.fillStyle);
  }
  restore() {
    this.fillStyle = this.saved.pop() ?? 'initial';
    this.restored++;
  }
  setTransform(...args: [number, number, number, number, number, number]) {
    this.transforms.push(args);
  }
  clip() {}
  rect(_x: number, _y: number, _w: number, _h: number) {}
  fillRect(x: number, y: number, w: number, h: number) {
    this.rectangles.push({ x, y, w, h, color: this.fillStyle });
  }
  beginPath() {}
  moveTo(_x: number, _y: number) {}
  lineTo(_x: number, _y: number) {}
  stroke() {
    this.strokes++;
  }
}
test('peak normalization, gain, RMS and signed detail coordinates', () => {
  assert.deepEqual(aggregatePeaks(new Int16Array([-32768, 16384, -10, 32767]), 16, 0, 2), {
    min: -1,
    max: 32767 / 32768,
  });
  assert.equal(aggregatePeaks(new Int8Array(), 8, 0, 1), null);
  assert.deepEqual(scalePeakByGain({ min: 0.6, max: 0.9 }, 2), { min: 1, max: 1 });
  assert.equal(rms(new Float32Array([-1, 1, -1, 1]), 0, 4), 1);
  const points = samplePoints(new Float32Array([1, -1, 0.5]), base, 50, 50);
  assert.deepEqual(
    points.map((p) => [p.x, p.y]),
    [
      [0, 0],
      [2, 100],
      [4, 25],
    ],
  );
  const narrow = { ...base, width: 4, scroll: 0.1 };
  assert.deepEqual(
    samplePoints(new Float32Array([1, -1, 0.5]), narrow, 50, 50).map((p) => p.x),
    [0, 2],
  );
});
test('DPR, resize and pan preserve fractional source alignment within one device pixel', () => {
  for (const dpr of [1, 1.25, 1.5, 2]) {
    const view = { ...base, dpr, width: 85, scroll: 0.15 };
    const x = sampleX(4, view);
    assert.ok(Math.abs(x - 5) <= 1 / dpr);
    const context = new Context();
    drawWaveform(context, [new Float32Array(20).fill(0.5)], view, colors, false);
    assert.deepEqual(context.transforms[0], [1, 0, 0, 1, 0, 0]);
    assert.equal(context.restored, 1);
    assert.equal(context.fillStyle, 'initial');
  }
});

test('a viewport between adjacent samples keeps the connecting segment', () => {
  const points = samplePoints(
    new Float32Array([0.5, -0.5]),
    { ...base, scroll: 0.025, width: 0.5 },
    50,
    50,
  );
  assert.equal(points.length, 2);
  assert.ok(points[0].x < 0);
  assert.ok(points[1].x > 0.5);
});
test('pixel intervals include boundary crossings without inventing samples past the source', () => {
  const samples = new Float32Array([0, 1, 0]);
  assert.deepEqual(samplePeak(samples, 0.5, 1.5), { min: 0.5, max: 1 });
  assert.deepEqual(samplePeak(samples, -1, 0.5), { min: 0, max: 0.5 });
  assert.deepEqual(samplePeak(samples, 1.5, 4), { min: 0, max: 0.5 });
  assert.equal(samplePeak(samples, 3, 4), null);
});

test('broad RMS toggle leaves outer channels, no mutation or invented data, state restored', () => {
  const channel = Float32Array.from({ length: 100 }, (_, i) => (i % 2 ? 0.5 : -0.5)),
    silent = new Float32Array(100);
  const before = channel.slice();
  const view = { ...base, scale: 1, width: 10, height: 200 };
  const on = new Context(),
    off = new Context();
  drawWaveform(on, [channel, silent], view, colors, true);
  drawWaveform(off, [channel, silent], view, colors, false);
  assert.deepEqual(
    on.rectangles.filter((r) => r.color === 'blue'),
    off.rectangles,
  );
  assert.equal(on.rectangles.filter((r) => r.color === 'red').length, 10);
  for (const fill of on.rectangles.filter((r) => r.color === 'red')) {
    const outer = off.rectangles.find((r) => r.x === fill.x && r.y < fill.y);
    assert.ok(outer);
    assert.ok(fill.y + fill.h < outer.y + outer.h);
  }
  assert.deepEqual(channel, before);
  assert.ok(off.rectangles.some((r) => r.y === 25));
  assert.ok(off.rectangles.some((r) => r.y === 150));
  for (const [channels, v] of [
    [[], view],
    [[new Float32Array()], view],
    [[channel], { ...view, width: 0 }],
    [[channel], { ...view, scroll: 1000 }],
  ] as const) {
    const context = new Context();
    drawWaveform(context, channels, v, colors, false);
    assert.equal(context.rectangles.length, 0);
    assert.equal(context.restored, 1);
  }
  assert.throws(
    () =>
      drawWaveform(
        new Context(),
        [{ peaks: new Int8Array([-1, 1]), bits: 8, samplesPerPeak: 10, length: 10 }],
        view,
        colors,
        true,
      ),
    /requires source/,
  );
});
