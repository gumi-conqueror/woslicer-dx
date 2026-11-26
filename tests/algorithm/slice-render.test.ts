import { describe, expect, test } from 'vitest';
import { renderSlice } from '../../src/core/audio/slice';
import { sourceAudio } from '../support/audio';

const whole = (length: number) => ({ start: 0, end: length, fadeoutMs: 0, noisegateDb: 0 });

describe('slice body', () => {
  test('copies the source after the attack and adds 16 silent frames', () => {
    const left = new Int16Array(512).fill(1200);
    const right = new Int16Array(512).fill(-600);
    const result = renderSlice(sourceAudio([left, right]), { ...whole(512), noisegateDb: -48 });
    expect(result.length).toBe(528);
    expect([result.channels[0][100], result.channels[1][100]]).toEqual([1200, -600]);
    expect([...result.channels[0].subarray(512)]).toEqual(new Array(16).fill(0));
    expect([...left.subarray(0, 3)]).toEqual([1200, 1200, 1200]);
  });

  test('raises the first millisecond with a raised-cosine attack', () => {
    // 48 kHz: the attack is 48 frames. Frame 24 is half way; truncation makes 500 into 499.
    const result = renderSlice(sourceAudio([new Int16Array(4000).fill(1000)]), whole(4000));
    const channel = result.channels[0];
    expect([channel[0], channel[24], channel[48], channel[200]]).toEqual([0, 499, 1000, 1000]);
    const falls = [];
    for (let frame = 1; frame <= 48; frame++)
      if (channel[frame] < channel[frame - 1]) falls.push(frame);
    expect(falls).toEqual([]);
  });

  test('a slice that starts at the source end is empty, even with a fade-out', () => {
    const source = sourceAudio([new Int16Array(512).fill(1200), new Int16Array(512)]);
    const result = renderSlice(source, { start: 512, end: 512, fadeoutMs: 500, noisegateDb: -48 });
    expect(result.length).toBe(0);
    expect(result.channels.map((channel) => channel.length)).toEqual([0, 0]);
  });

  test('the slice end and the fade-out stop at the source end', () => {
    const source = sourceAudio([new Int16Array(512).fill(1200)]);
    const params = { ...whole(512), noisegateDb: -48 };
    const expected = renderSlice(source, params);
    expect(renderSlice(source, { ...params, end: 999 })).toEqual(expected);
    expect(renderSlice(source, { ...params, fadeoutMs: 500 })).toEqual(expected);
  });

  test('rejects a negative start', () => {
    expect(() =>
      renderSlice(sourceAudio([new Int16Array(10)]), { ...whole(10), start: -1 }),
    ).toThrow(RangeError);
  });
});

describe('fade-out', () => {
  test('appends the following source material with a falling raised-cosine gain', () => {
    // 10 ms at 48 kHz: 480 frames of fade-out after frame 200.
    const result = renderSlice(sourceAudio([new Int16Array(1000).fill(2000)]), {
      start: 0,
      end: 200,
      fadeoutMs: 10,
      noisegateDb: -48,
    });
    expect(result.length).toBe(200 + 480 + 16);
    const channel = result.channels[0];
    expect([channel[199], channel[440], channel[679]]).toEqual([2000, 993, 0]);
  });

  test('stops at the source end without inventing material', () => {
    const result = renderSlice(sourceAudio([new Int16Array(9600).fill(1000)]), {
      ...whole(9600),
      fadeoutMs: 250,
    });
    // No material follows the slice; the 0 dB gate removes the silent pad.
    expect(result.length).toBe(9599);
    expect(Math.min(...result.channels[0])).toBe(0);
    expect(result.channels[0][9598]).toBe(1000);
  });
});

describe('noise gate', () => {
  test('at 0 dB, cuts trailing digital silence after the last non-zero frame', () => {
    const data = new Int16Array(100);
    data[50] = 500;
    expect(renderSlice(sourceAudio([data]), whole(100)).length).toBe(50);
  });

  test('keeps 11025 frames after the last loud frame and fades them out', () => {
    const data = new Int16Array(20000);
    data[150] = -129;
    const result = renderSlice(sourceAudio([new Int16Array(20000), data]), {
      ...whole(20000),
      noisegateDb: -48,
    });
    expect(result.length).toBe(150 + 11025);
    expect(result.channels[1][150]).toBe(-129);
    expect(data[150]).toBe(-129);
  });

  test('treats a frame exactly at the threshold as quiet', () => {
    // -48 dB is exactly 128 on the PCM16 scale; a silent slice keeps 4 frames.
    const data = new Int16Array(20000);
    data[150] = 128;
    expect(renderSlice(sourceAudio([data]), { ...whole(20000), noisegateDb: -48 }).length).toBe(4);
  });

  test('leaves the slice unchanged when the quiet tail is shorter than 11025 frames', () => {
    const data = new Int16Array(200).fill(1000);
    const result = renderSlice(sourceAudio([data]), { ...whole(200), noisegateDb: -48 });
    expect(result.length).toBe(216);
    expect(result.channels[0][100]).toBe(1000);
  });
});
