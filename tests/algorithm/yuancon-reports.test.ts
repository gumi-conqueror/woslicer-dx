import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import capture from '../fixtures/input/yuancon-capture.json';
import { createYuanconReader } from '../../src/input/yuancon/recording';
import { decodeYuanconReport } from '../../src/input/yuancon/protocol';

function report(keys: number, value: number, length = 15) {
  const data = new DataView(new ArrayBuffer(length));
  data.setUint8(0, keys);
  if (length >= 6) data.setInt16(4, value, true);
  return data;
}
describe('YuanCon recording reports', () => {
  it('replays all captured state changes without merging distinct keys or sustained turns', () => {
    const reports = z.array(z.tuple([z.number(), z.number(), z.number()])).parse(capture.reports);
    const read = createYuanconReader();
    let positive = 0;
    let keys = 0;
    let markerReports = 0;
    for (const [time, mask, direction] of reports) {
      const state = decodeYuanconReport(6, report(mask, direction));
      if (!state) throw new Error('Captured report failed to decode');
      const controls = read(state, time / 1000, true);
      positive += controls.filter((control) => control === 'positive').length;
      const pressed = controls.filter((control) => control.startsWith('key')).length;
      keys += pressed;
      if (pressed) markerReports++;
    }
    expect(reports).toHaveLength(1481);
    expect({ positive, keys, markerReports }).toEqual({
      positive: 22,
      keys: 795,
      markerReports: 705,
    });
  });
  it('validates the exact report profile and preserves all seven keys', () => {
    expect(decodeYuanconReport(6, report(127, -32767))).toEqual({ keys: 127, direction: -1 });
    expect(decodeYuanconReport(6, report(1, 32767))).toEqual({ keys: 1, direction: 1 });
    expect(decodeYuanconReport(6, report(0, 0))).toEqual({ keys: 0, direction: 0 });
    expect(decodeYuanconReport(5, report(0, 0))).toBeNull();
    expect(decodeYuanconReport(6, report(0, 0, 2))).toBeNull();
    expect(decodeYuanconReport(6, report(128, 0))).toBeNull();
    expect(decodeYuanconReport(6, report(0, 42))).toBeNull();
  });
  it('keeps short presses, ignores repeated reports and switches directly between turn directions', () => {
    const read = createYuanconReader();
    read({ keys: 0, direction: 0 }, 0, true);
    for (let bit = 0; bit < 7; bit++) {
      expect(read({ keys: 1 << bit, direction: 0 }, bit * 20 + 1, true)).toEqual([`key${bit}`]);
      expect(read({ keys: 1 << bit, direction: 0 }, bit * 20 + 3, true)).toEqual([]);
      expect(read({ keys: 0, direction: 0 }, bit * 20 + 11, true)).toEqual([]);
    }
    expect(read({ keys: 0, direction: 1 }, 200, true)).toEqual(['positive']);
    expect(read({ keys: 0, direction: 1 }, 1000, true)).toEqual([]);
    expect(read({ keys: 1, direction: -1 }, 1010, true)).toEqual(['negative', 'key0']);
    expect(read({ keys: 1, direction: -1 }, 1100, true)).toEqual([]);
    expect(read({ keys: 1, direction: -1 }, 1160, true)).toEqual(['negative']);
    expect(read({ keys: 1, direction: 1 }, 1170, true)).toEqual(['positive']);
    expect(read({ keys: 1, direction: 1 }, 2000, true)).toEqual([]);
  });
  it('requires neutral on initial connection, disabled input and disconnect', () => {
    const read = createYuanconReader();
    expect(read({ keys: 1, direction: 1 }, 0, true)).toEqual([]);
    read({ keys: 0, direction: 0 }, 1, true);
    expect(read({ keys: 1, direction: -1 }, 2, true)).toEqual(['negative', 'key0']);
    read(null, 3, false);
    expect(read({ keys: 1, direction: -1 }, 1000, true)).toEqual([]);
    read({ keys: 0, direction: 0 }, 1001, true);
    expect(read({ keys: 2, direction: 0 }, 1002, true)).toEqual(['key1']);
  });
  it('preserves captured reversals through short neutral gaps and stops on the final neutral', () => {
    // First/last reports of each direction run, with intervening duplicates omitted.
    // Capture SHA-256: 4ca7f15887a9778d9e0bdeb16acad4931ab3b3b29a94ba4f855df610838b7ccc.
    // These 19.064/21.005 ms neutral gaps precede sustained reversals, not proven noise.
    const reports = [
      [116344.713, 0, []],
      [116347.71, 1, ['positive']],
      [116620.701, 1, []],
      [116623.71, 0, []],
      [116639.836, 0, []],
      [116642.774, -1, ['negative']],
      [116908.692, -1, ['negative']],
      [116911.696, 0, []],
      [116930.704, 0, []],
      [116932.701, 1, ['positive']],
      [117077.696, 1, []],
      [117080.701, -1, ['negative']],
      [117332.725, -1, ['negative']],
      [117334.698, 0, []],
    ] as const;
    const read = createYuanconReader();
    for (const [time, direction, controls] of reports)
      expect(read({ keys: 0, direction }, time, true)).toEqual(controls);
    expect(read({ keys: 0, direction: 0 }, 118000, true)).toEqual([]);
  });
});
