import type { Division } from '@gumi-conqueror/bmh-file';
import { arrange, defaultSettings } from './notes/arrangement.js';
import { chronological, type SortKey } from './notes/sound-groups.js';
import { formatId, stepId, renumber } from './formats/numbering.js';
import { CLIPBOARD_FORMAT, recordingCutText, sourceSequenceText } from './formats/clipboard.js';
import { definitionText } from './formats/definitions.js';
import type { MidiSequence } from '@gumi-conqueror/bmh-file';

export const BMSE_CLIPBOARD_HEADER = CLIPBOARD_FORMAT;
export type SortType =
  | 'none'
  | 'nn_gate_vel'
  | 'nn_vel_gate'
  | 'gate_nn_vel'
  | 'gate_vel_nn'
  | 'vel_nn_gate'
  | 'vel_gate_nn';
export interface DivisionSetting {
  name: string;
  srcCopy: boolean;
  headMargin: number;
  minInterval: number;
  sortType: SortType;
  gateThreshold: number;
  velocityThreshold: number;
  zzDefinition: boolean;
  mlDefinition: boolean;
  startDefinition: number;
  mlThreshold: number;
}
const priorities: Record<SortType, readonly SortKey[]> = {
  none: [],
  nn_gate_vel: ['pitch', 'duration', 'velocity'],
  nn_vel_gate: ['pitch', 'velocity', 'duration'],
  gate_nn_vel: ['duration', 'pitch', 'velocity'],
  gate_vel_nn: ['duration', 'velocity', 'pitch'],
  vel_nn_gate: ['velocity', 'pitch', 'duration'],
  vel_gate_nn: ['velocity', 'duration', 'pitch'],
};
export function defaultDivisionSetting(name: string, quantize: number): DivisionSetting {
  const defaults = defaultSettings(quantize);
  return {
    name,
    srcCopy: defaults.sourceCopy,
    headMargin: defaults.headMargin,
    minInterval: defaults.spacing,
    sortType: 'nn_gate_vel',
    gateThreshold: defaults.durationTolerance,
    velocityThreshold: defaults.velocityTolerance,
    zzDefinition: defaults.numbering === 'extended',
    mlDefinition: defaults.sharing,
    startDefinition: defaults.firstDefinition,
    mlThreshold: defaults.freeGap,
  };
}
export function zzToString(zz: number): string {
  return formatId(zz);
}
export function nextZz(zz: number, ffMode: boolean): number {
  return stepId(zz, 1, ffMode ? 'restricted' : 'extended');
}
export function prevZz(zz: number, ffMode: boolean): number {
  return stepId(zz, -1, ffMode ? 'restricted' : 'extended');
}
function sourceNotes(source: MidiSequence) {
  return chronological(
    source.notes.map((note, index) => ({
      sourceId: String(index),
      onset: note.position,
      duration: note.gate,
      pitch: note.nn,
      velocity: note.vel,
    })),
  );
}
export function createDivision(source: MidiSequence, setting: DivisionSetting): Division {
  const ordered = sourceNotes(source);
  const result = arrange(ordered, {
    resolution: source.quantize,
    headMargin: setting.headMargin,
    spacing: setting.minInterval,
    durationTolerance: setting.gateThreshold,
    velocityTolerance: setting.velocityThreshold,
    sort: priorities[setting.sortType],
    numbering: setting.zzDefinition ? 'extended' : 'restricted',
    sharing: setting.mlDefinition,
    firstDefinition: setting.startDefinition,
    freeGap: setting.mlThreshold,
    sourceCopy: setting.srcCopy,
  });
  const sourceIndexes = new Map(ordered.map((note, index) => [note.sourceId, index]));
  const soundIndexes = new Map(result.sounds.map((sound, index) => [sound.soundId, index]));
  const definitionIndexes = new Map(
    result.definitions.map((definition, index) => [definition.definitionId, index]),
  );
  const assignments = new Map(
    result.assignments.map((assignment) => [assignment.sourceId, assignment.definitionId]),
  );
  function indexFor<K>(map: ReadonlyMap<K, number>, key: K): number {
    const index = map.get(key);
    if (index === undefined) throw new RangeError('Incomplete note association');
    return index;
  }
  const recording = result.sounds.map((sound) => ({
    position: sound.onset,
    gate: sound.duration,
    nn: sound.pitch,
    vel: sound.velocity,
  }));
  return {
    name: setting.name,
    quantize: source.quantize,
    zzDefinition: setting.zzDefinition,
    recording,
    notes: result.sounds.map((sound) => ({
      nn: sound.pitch,
      gate: sound.duration,
      vel: sound.velocity,
      recPos: sound.onset,
      referrers: sound.sourceIds.map((id) => indexFor(sourceIndexes, id)),
    })),
    definitions: result.definitions.map((definition) => ({
      zz: definition.definitionId,
      div: indexFor(soundIndexes, definition.soundId),
    })),
    src2def: ordered.map((note) =>
      indexFor(definitionIndexes, indexFor(assignments, note.sourceId)),
    ),
  };
}
export function transposeDefinitions(division: Division, delta: 1 | -1, ffMode: boolean): void {
  const ids = division.definitions.map((definition) =>
    stepId(definition.zz, delta, ffMode ? 'restricted' : 'extended'),
  );
  division.definitions.forEach((definition, index) => {
    definition.zz = ids[index];
  });
}
export function setStartDefinition(division: Division, start: number, ffMode: boolean): void {
  const ids = renumber(
    division.definitions.map((definition) => definition.zz),
    start,
    ffMode ? 'restricted' : 'extended',
  );
  division.definitions.forEach((definition, index) => {
    definition.zz = ids[index];
  });
}
export function cutPositionsClipboard(division: Division): string {
  return recordingCutText(
    division.recording.map((note) => note.position),
    division.quantize,
  );
}
export function bmsSequenceClipboard(division: Division, source: MidiSequence): string {
  return sourceSequenceText(
    sourceNotes(source).map((note, index) => {
      const definition = division.definitions[division.src2def[index]];
      if (!definition) throw new RangeError('Missing source definition');
      return { onset: note.onset, definitionId: definition.zz };
    }),
    division.quantize,
  );
}
export function wavDefinitionText(division: Division, fileName: string): string {
  return definitionText(
    division.definitions.map((definition) => ({
      identifier: definition.zz,
      soundOrdinal: definition.div,
    })),
    fileName,
  );
}
