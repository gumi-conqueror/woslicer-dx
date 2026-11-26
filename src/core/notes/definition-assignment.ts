import type { SourceNote, Sound } from './sound-groups.js';
import { stepId } from '../formats/numbering.js';
import type { ArrangementSettings } from './arrangement.js';
export interface Definition {
  readonly definitionId: number;
  readonly soundId: number;
}
export interface Assignment {
  readonly sourceId: string;
  readonly definitionId: number;
}

/**
 * The fewest definitions that can play the occurrences in turn. A definition
 * can be reused after its previous occurrence ends at least `freeGap` ticks earlier.
 */
function sharedDefinitionCount(occurrences: readonly SourceNote[], freeGap: number): number {
  for (let count = 1; count < occurrences.length; count++) {
    const fits = occurrences.every((note, i) => {
      const previous = occurrences[i - count];
      return !previous || note.onset - (previous.onset + previous.duration) >= freeGap;
    });
    if (fits) return count;
  }
  return occurrences.length;
}

/** `notes` are the validated source notes in chronological order (see `arrange`). */
export function assignDefinitions(
  notes: readonly SourceNote[],
  sounds: readonly Sound[],
  settings: Pick<ArrangementSettings, 'sharing' | 'freeGap' | 'firstDefinition' | 'numbering'>,
): {
  definitions: Definition[];
  assignments: Assignment[];
} {
  const definitions: Definition[] = [];
  const assignments: Assignment[] = [];
  for (const sound of sounds) {
    const occurrences = notes.filter((n) => sound.sourceIds.includes(n.sourceId));
    if (!occurrences.length) throw new RangeError('Sound has no source occurrences');
    const count = settings.sharing
      ? sharedDefinitionCount(occurrences, settings.freeGap)
      : occurrences.length;
    const ids: number[] = [];
    for (let i = 0; i < count; i++) {
      const id = stepId(settings.firstDefinition, definitions.length, settings.numbering);
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
