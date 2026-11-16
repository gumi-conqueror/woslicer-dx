import type { NumberingMode } from '../formats/numbering.js';
import type { SourceNote, Sound, SortKey } from './sound-groups.js';
import { chronological, groupSounds, sortSounds } from './sound-groups.js';
import { assignDefinitions } from './definition-assignment.js';
export interface ArrangementSettings {
  readonly resolution: number;
  readonly headMargin: number;
  readonly spacing: number;
  readonly durationTolerance: number;
  readonly velocityTolerance: number;
  readonly sort: readonly SortKey[];
  readonly numbering: NumberingMode;
  readonly sharing: boolean;
  readonly firstDefinition: number;
  readonly freeGap: number;
  readonly sourceCopy: boolean;
}
export function defaultSettings(resolution: number): ArrangementSettings {
  if (!Number.isFinite(resolution) || resolution <= 0) throw new RangeError('Invalid resolution');
  return {
    resolution,
    headMargin: 0,
    spacing: resolution,
    durationTolerance: Math.trunc(resolution / 8),
    velocityTolerance: 5,
    sort: ['pitch', 'duration', 'velocity'],
    numbering: 'extended',
    sharing: true,
    firstDefinition: 1,
    freeGap: Math.trunc(resolution / 2),
    sourceCopy: false,
  };
}
export function beatsToTicks(beats: number, resolution: number): number {
  if (!Number.isFinite(beats) || beats < 0 || !Number.isFinite(resolution) || resolution <= 0)
    throw new RangeError('Invalid beat input');
  return Math.trunc(beats * resolution);
}
export function arrange(notes: readonly SourceNote[], settings: ArrangementSettings) {
  defaultSettings(settings.resolution);
  for (const value of [
    settings.headMargin,
    settings.spacing,
    settings.durationTolerance,
    settings.velocityTolerance,
    settings.freeGap,
  ]) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError('Invalid arrangement setting');
  }
  const ordered = chronological(notes);
  let sounds: Sound[];
  if (settings.sourceCopy)
    sounds = ordered.map((n, soundId) => ({
      ...n,
      soundId,
      onset: n.onset + settings.headMargin,
      sourceIds: [n.sourceId],
    }));
  else {
    sounds = sortSounds(
      groupSounds(ordered, settings.durationTolerance, settings.velocityTolerance),
      settings.sort,
    );
    let next = settings.headMargin;
    sounds = sounds.map((sound) => {
      const placed = { ...sound, onset: next };
      next =
        Math.ceil((next + sound.duration + settings.spacing) / settings.resolution) *
        settings.resolution;
      return placed;
    });
  }
  return {
    sounds,
    ...assignDefinitions(
      ordered,
      sounds,
      settings.sharing,
      settings.freeGap,
      settings.firstDefinition,
      settings.numbering,
    ),
  };
}
