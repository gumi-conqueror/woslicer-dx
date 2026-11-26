/**
 * The YuanCon HID collection: Generic Desktop (usage page 1), Joystick (usage 4).
 * `src-tauri/src/input.rs` (`supported`) repeats these values;
 * `scripts/native-consistency.test.mjs` checks that they agree.
 */
export const YUANCON_FILTER = { vendorId: 0x1ccf, productId: 0x8048, usagePage: 1, usage: 4 };
export const YUANCON_KEYS = ['key0', 'key1', 'key2', 'key3', 'key4', 'key5', 'key6'] as const;
export type YuanconControl = 'positive' | 'negative' | (typeof YUANCON_KEYS)[number];
export type YuanconGuideControl = 'positive' | 'negative' | 'keys';
export interface YuanconState {
  keys: number;
  direction: -1 | 0 | 1;
}

/** Both transports separate the report ID from its payload. */
export function decodeYuanconReport(reportId: number, data: DataView): YuanconState | null {
  if (reportId !== 6 || data.byteLength !== 15) return null;
  const keys = data.getUint8(0);
  const value = data.getInt16(4, true);
  if (keys > 0x7f || (value !== -32767 && value !== 0 && value !== 32767)) return null;
  return { keys, direction: value === 0 ? 0 : value > 0 ? 1 : -1 };
}
