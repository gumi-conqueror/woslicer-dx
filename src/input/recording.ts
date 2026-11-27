import type { MarkerKey } from '../project/schema';

/** One recording tap: the input time and the pressed recording keys 1–7. */
export interface RecordingInput {
  time?: number;
  keys: readonly MarkerKey[];
}
export const RECORDING_SEEK_SECONDS = 0.5;
/** A fast seek, for a long stick push, moves four ordinary seeks at once. */
export const FAST_SEEK_SECONDS = 4 * RECORDING_SEEK_SECONDS;

/** The `KeyboardEvent.code` of a key text; synthetic events can lack `code`. */
export function codeForKey(key: string): string {
  return key === ' ' ? 'Space' : `Key${key.toUpperCase()}`;
}
/** The physical key of an event. */
export function eventCode(event: Pick<KeyboardEvent, 'code' | 'key'>): string {
  return event.code || codeForKey(event.key);
}
/** Display text of a physical key code: `KeyZ` becomes `Z`. */
export function codeLabel(code: string): string {
  return code.replace(/^Key/, '');
}

/** Taps that arrive together form one chord; their keys merge in pressing order. */
export function mergeTaps(taps: readonly RecordingInput[]): RecordingInput | undefined {
  const first = taps[0];
  if (!first) return undefined;
  const keys = [...new Set(taps.flatMap((tap) => tap.keys))];
  return first.time === undefined ? { keys } : { time: first.time, keys };
}
