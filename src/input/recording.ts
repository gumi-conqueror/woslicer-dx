import type { RecordingInput } from '../app/commands';

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
