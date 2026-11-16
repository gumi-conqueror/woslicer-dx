import type { Note } from './pairing.js';
export interface SourceNote extends Note {
  readonly sourceId: string;
}
export interface Sound extends Note {
  readonly soundId: number;
  readonly sourceIds: readonly string[];
}
export type SortKey = 'pitch' | 'duration' | 'velocity';
export function chronological(notes: readonly SourceNote[]): SourceNote[] {
  const ids = new Set<string>();
  for (const n of notes) {
    if (ids.has(n.sourceId)) throw new RangeError('Duplicate source ID');
    ids.add(n.sourceId);
    if (
      ![n.onset, n.duration, n.pitch, n.velocity].every(Number.isFinite) ||
      n.onset < 0 ||
      n.duration < 0 ||
      !Number.isInteger(n.pitch) ||
      n.pitch < 0 ||
      n.pitch > 127 ||
      !Number.isInteger(n.velocity) ||
      n.velocity < 1 ||
      n.velocity > 127
    )
      throw new RangeError('Invalid source note');
  }
  return notes
    .map((n, i) => ({ n, i }))
    .sort((a, b) => a.n.onset - b.n.onset || a.i - b.i)
    .map((x) => ({ ...x.n }));
}
export function groupSounds(
  notes: readonly SourceNote[],
  durationTolerance: number,
  velocityTolerance: number,
): Sound[] {
  if (![durationTolerance, velocityTolerance].every((n) => Number.isFinite(n) && n >= 0))
    throw new RangeError('Invalid tolerance');
  const groups: SourceNote[][] = [];
  const compatible = (a: SourceNote, b: SourceNote): boolean =>
    a.pitch === b.pitch &&
    Math.abs(a.duration - b.duration) <= durationTolerance &&
    Math.abs(a.velocity - b.velocity) <= velocityTolerance;
  for (const note of chronological(notes)) {
    const group = groups.find((g) => g.some((n) => compatible(n, note)));
    if (group) group.push(note);
    else groups.push([note]);
  }
  // Subdivision: first compatible complete-link range in established order.
  // Broad chain partition parity requires external discriminating examples.
  const ranges: SourceNote[][] = [];
  for (const group of groups) {
    const local: SourceNote[][] = [];
    for (const note of group) {
      const range = local.find((r) => r.every((n) => compatible(n, note)));
      if (range) range.push(note);
      else local.push([note]);
    }
    ranges.push(...local);
  }
  return ranges.map((range, soundId) => {
    const first = range[0];
    if (!first) throw new Error('Empty sound range');
    return {
      soundId,
      onset: 0,
      pitch: first.pitch,
      duration: Math.trunc(range.reduce((s, n) => s + n.duration, 0) / range.length),
      velocity: Math.trunc(range.reduce((s, n) => s + n.velocity, 0) / range.length),
      sourceIds: range.map((n) => n.sourceId),
    };
  });
}
export function sortSounds(sounds: readonly Sound[], priorities: readonly SortKey[]): Sound[] {
  if (
    priorities.length &&
    (priorities.length !== 3 ||
      new Set(priorities).size !== 3 ||
      priorities.some((k) => !['pitch', 'duration', 'velocity'].includes(k)))
  )
    throw new RangeError('Expected sort permutation or unchanged order');
  return sounds
    .map((sound, i) => ({ sound, i }))
    .sort((a, b) => {
      for (const key of priorities) {
        const difference = (a.sound[key] - b.sound[key]) * (key === 'pitch' ? 1 : -1);
        if (difference) return difference;
      }
      return a.i - b.i;
    })
    .map((x) => x.sound);
}
