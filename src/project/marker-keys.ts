import type { MarkerKey, ProjectDocument } from './schema';

export type MarkerKeys = NonNullable<ProjectDocument['slicing']['markerKeys']>;

/** Keep attributes attached through edits, merging chords when markers meet. */
export function remapMarkerKeys(
  entries: MarkerKeys,
  target: (tick: number) => number,
): { tick: number; keys: MarkerKey[] }[] {
  const merged = new Map<number, Set<MarkerKey>>();
  for (const entry of entries) {
    const tick = target(entry.tick);
    const keys = merged.get(tick) ?? new Set<MarkerKey>();
    for (const key of entry.keys) keys.add(key);
    merged.set(tick, keys);
  }
  return Array.from(merged, ([tick, keys]) => ({ tick, keys: [...keys].sort((a, b) => a - b) }));
}
