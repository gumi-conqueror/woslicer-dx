import type { SourceNote, Sound } from './sound-groups.js';
import { chronological } from './sound-groups.js';
import type { NumberingMode } from '../formats/numbering.js';
import { stepId } from '../formats/numbering.js';
export interface Definition {
  readonly definitionId: number;
  readonly soundId: number;
}
export interface Assignment {
  readonly sourceId: string;
  readonly definitionId: number;
}
export function assignDefinitions(
  notes: readonly SourceNote[],
  sounds: readonly Sound[],
  sharing: boolean,
  freeGap: number,
  first: number,
  mode: NumberingMode,
): {
  definitions: Definition[];
  assignments: Assignment[];
} {
  if (!Number.isFinite(freeGap) || freeGap < 0) throw new RangeError('Invalid free gap');
  stepId(first, 0, mode);
  const ordered = chronological(notes);
  const definitions: Definition[] = [];
  const assignments: Assignment[] = [];
  for (const sound of sounds) {
    const occurrences = ordered.filter((n) => sound.sourceIds.includes(n.sourceId));
    if (!occurrences.length) throw new RangeError('Sound has no source occurrences');
    let count = occurrences.length;
    if (sharing)
      for (let candidate = 1; candidate <= occurrences.length; candidate++) {
        const last = new Map<number, SourceNote>();
        let valid = true;
        for (let i = 0; i < occurrences.length; i++) {
          const note = occurrences[i];
          if (!note) throw new Error('Missing occurrence');
          const previous = last.get(i % candidate);
          if (previous && note.onset - (previous.onset + previous.duration) < freeGap) {
            valid = false;
            break;
          }
          last.set(i % candidate, note);
        }
        if (valid) {
          count = candidate;
          break;
        }
      }
    const ids: number[] = [];
    for (let i = 0; i < count; i++) {
      const id = stepId(first, definitions.length, mode);
      if (definitions.some((d) => d.definitionId === id))
        throw new RangeError('Definition capacity exceeded');
      definitions.push({ definitionId: id, soundId: sound.soundId });
      ids.push(id);
    }
    occurrences.forEach((n, i) => {
      const id = ids[i % count];
      if (id === undefined) throw new Error('Missing definition');
      assignments.push({ sourceId: n.sourceId, definitionId: id });
    });
  }
  if (
    assignments.length !== notes.length ||
    new Set(assignments.map((a) => a.sourceId)).size !== notes.length
  )
    throw new RangeError('Incomplete source associations');
  return { definitions, assignments };
}
