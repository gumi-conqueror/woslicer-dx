import { YUANCON_KEYS, type YuanconControl, type YuanconState } from '../input/yuancon/protocol';

/**
 * Recording policy for held directions. The capture includes sustained direct
 * reversals and 19–21 ms neutral gaps; it establishes no tail-noise threshold.
 */
export function createYuanconReader() {
  let previous: YuanconState = { keys: 0, direction: 0 };
  let suspended = true;
  let nextRewind = Infinity;
  return (state: YuanconState | null, now: number, enabled: boolean): YuanconControl[] => {
    if (!state || !enabled) {
      suspended = true;
      previous = state ?? { keys: 0, direction: 0 };
      nextRewind = Infinity;
      return [];
    }
    if (suspended) {
      if (state.keys === 0 && state.direction === 0) suspended = false;
      previous = state;
      return [];
    }
    const controls: YuanconControl[] = [];
    if (state.direction === 1 && previous.direction !== 1) controls.push('positive');
    if (state.direction === -1) {
      if (previous.direction !== -1 || now >= nextRewind) {
        controls.push('negative');
        nextRewind = now + (previous.direction !== -1 ? 150 : 110);
      }
    } else nextRewind = Infinity;
    for (const [bit, key] of YUANCON_KEYS.entries())
      if (state.keys & ~previous.keys & (1 << bit)) controls.push(key);
    previous = state;
    return controls;
  };
}
