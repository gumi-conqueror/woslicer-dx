import type { z } from 'zod';
import { markerTicks } from '@gumi-conqueror/wos-file';
import { errorMessage } from '../core/messages';
import { defaultBaseName } from '../core/slices';
import { DEFAULT_CUE_DB, DEFAULT_PLAYBACK_DB } from '../core/volume';
import { MAX_TICKS } from '../core/timebase';
import {
  byteLimitText,
  PROJECT_FILE_MAX_BYTES,
  PROJECT_FORMAT,
  PROJECT_SCHEMA_VERSION,
  originHintKeys,
  projectHeaderSchema,
  projectSchema,
  type ProjectDocument,
  type ProjectFile,
  type ProjectParseResult,
  type ProjectTrack,
} from './schema';

export class ProjectFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectFormatError';
  }
}

function parseStructure<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue?.path.reduce<string>(
    (label, key) => (typeof key === 'number' ? label + '[' + key + ']' : label + '.' + String(key)),
    'Project',
  );
  throw new ProjectFormatError(
    (path ?? 'Project') + ': ' + (issue?.message ?? 'invalid structure'),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Compare with the stripped schema output, without maintaining a second field list. */
function unknownFields(input: unknown, project: ProjectFile): string[] {
  const fields: string[] = [];
  function visit(raw: unknown, known: unknown, path: string): void {
    if (fields.length >= 16) return;
    if (Array.isArray(raw) && Array.isArray(known)) {
      known.forEach((value: unknown, index: number) =>
        visit(raw[index], value, path + '[' + index + ']'),
      );
      return;
    }
    if (!isRecord(raw) || !isRecord(known)) return;
    for (const key of Object.keys(raw)) {
      if (fields.length >= 16) return;
      // Both origin variants' fields are recognized.
      if (path.endsWith('.originHint') && originHintKeys.has(key)) continue;
      if (!Object.hasOwn(known, key)) fields.push(path ? path + '.' + key : key);
    }
    for (const [key, value] of Object.entries(known)) {
      visit(raw[key], value, path ? path + '.' + key : key);
    }
  }
  visit(input, project, '');
  return fields;
}

/**
 * The track that the editor edits. Until the multi-track editor lands it is
 * the only track; `requireEditableTracks` keeps other projects out of the editor.
 */
/** The track with this id; the first track when the id is absent or unknown. */
export function currentTrack<T extends ProjectDocument | ProjectFile>(
  project: T,
  trackId: string | null = null,
): T['tracks'][number] {
  const track = project.tracks.find((item) => item.trackId === trackId) ?? project.tracks[0];
  if (!track) throw new ProjectFormatError('Project has no track');
  return track;
}

/**
 * The editor edits projects with one track. The codec reads and writes any
 * number; the workspace calls this where a document enters the editor.
 */
export function requireEditableTracks(project: ProjectDocument | ProjectFile): void {
  if (project.tracks.length !== 1)
    throw new ProjectFormatError(
      `This project has ${project.tracks.length} tracks; this version edits projects with one track`,
    );
}

/**
 * Upgrades a version 1 file. Version 1 kept markers and output settings at
 * the project level and described audio as clips. Only the two layouts that
 * earlier releases could edit upgrade: no audio, or one track with one clip
 * that covers its whole media file. Unknown fields are dropped.
 */
function upgradeV1(input: Record<string, unknown>): unknown {
  const tracks = Array.isArray(input.tracks) ? input.tracks : [];
  const media = Array.isArray(input.media) ? input.media : [];
  const track: unknown = tracks[0];
  if (tracks.length !== 1 || !isRecord(track))
    throw new ProjectFormatError('This version 1 project has several tracks and cannot be opened');
  const clips = Array.isArray(track.clips) ? track.clips : [];
  const clip: unknown = clips[0];
  let asset: unknown = null;
  if (clips.length === 1 && isRecord(clip)) {
    asset = media.find((item: unknown) => isRecord(item) && item.mediaId === clip.mediaId) ?? null;
    const whole =
      isRecord(asset) &&
      clip.timelineStartSeconds === 0 &&
      clip.sourceOffsetFrames === 0 &&
      clip.frameCount === asset.framesPerChannel;
    if (!whole)
      throw new ProjectFormatError(
        'This version 1 project uses trimmed or offset audio and cannot be opened',
      );
  } else if (clips.length !== 0 || media.length !== 0)
    throw new ProjectFormatError('This version 1 project has several clips and cannot be opened');
  const { clips: _clips, ...trackFields } = track;
  return {
    format: input.format,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId: input.projectId,
    name: input.name,
    timing: input.timing,
    global: input.global,
    tracks: [{ ...trackFields, media: asset, slicing: input.slicing, output: input.output }],
    bmhelper: input.bmhelper,
  };
}

function normalizeTrack(track: ProjectTrack): void {
  // In-memory drafts may explicitly carry undefined; files omit absent hints.
  const hint = track.media?.originHint;
  if (hint?.kind === 'browser') {
    if (hint.relativePathHint === undefined) delete hint.relativePathHint;
    if (hint.lastModified === undefined) delete hint.lastModified;
  }
  const { slicing } = track;
  if (new Set(slicing.markers).size !== slicing.markers.length)
    throw new ProjectFormatError('slicing.markers contains duplicate ticks');
  slicing.markers.sort((a, b) => a - b);
  const markerTicks = new Set(slicing.markers);
  const attributedTicks = new Set<number>();
  for (const entry of slicing.markerKeys ?? []) {
    if (!markerTicks.has(entry.tick) || attributedTicks.has(entry.tick))
      throw new ProjectFormatError('slicing.markerKeys requires one entry per existing marker');
    if (new Set(entry.keys).size !== entry.keys.length)
      throw new ProjectFormatError('slicing.markerKeys contains duplicate keys');
    attributedTicks.add(entry.tick);
    entry.keys.sort((a, b) => a - b);
  }
  slicing.markerKeys?.sort((a, b) => a.tick - b.tick);
  if (!slicing.markerKeys?.length) delete slicing.markerKeys;
}

export function parseProject(input: unknown): ProjectParseResult {
  const { schemaVersion: version } = parseStructure(projectHeaderSchema, input);
  if (version > PROJECT_SCHEMA_VERSION) return { kind: 'unsupported-version', version, raw: input };
  const upgraded = version === 1 && isRecord(input) ? upgradeV1(input) : input;
  const project = parseStructure(projectSchema, upgraded);
  // Version 1 fields that have no place in version 2 are dropped without a report.
  const extensions = version === PROJECT_SCHEMA_VERSION ? unknownFields(input, project) : [];
  const ids = new Set<string>();
  for (const track of project.tracks) {
    if (ids.has(track.trackId))
      throw new ProjectFormatError('duplicate track id: ' + track.trackId);
    ids.add(track.trackId);
    normalizeTrack(track);
  }
  return { kind: 'supported', project, unknownFields: extensions };
}

/** Encodes the known, normalized fields of the current version. */
export function encodeProject(value: ProjectDocument): Uint8Array {
  const normalized = parseProject(value);
  if (normalized.kind !== 'supported')
    throw new ProjectFormatError('unsupported project schema cannot be written');
  const bytes = new TextEncoder().encode(JSON.stringify(normalized.project));
  if (bytes.byteLength > PROJECT_FILE_MAX_BYTES)
    throw new ProjectFormatError(
      `project exceeds the ${byteLimitText(PROJECT_FILE_MAX_BYTES)} limit`,
    );
  return bytes;
}
export function decodeProject(bytes: Uint8Array): ProjectParseResult {
  if (bytes.byteLength > PROJECT_FILE_MAX_BYTES)
    throw new ProjectFormatError(
      `project exceeds the ${byteLimitText(PROJECT_FILE_MAX_BYTES)} limit`,
    );
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    throw new ProjectFormatError(`project JSON is invalid: ${errorMessage(error)}`);
  }
  return parseProject(value);
}

/** A project with one track and no audio yet. */
export function createEmptyProject(
  projectId: string = crypto.randomUUID(),
  name = 'Untitled',
): ProjectFile {
  return {
    format: PROJECT_FORMAT,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId,
    name,
    timing: { bpm: 120, shiftTicks: 0 },
    global: {
      masterGainDb: DEFAULT_PLAYBACK_DB,
      masterMuted: false,
      cueGainDb: DEFAULT_CUE_DB,
      cueMode: 'off',
      playbackRate: 1,
      views: { rms: false, bands: false, spectrum: 'reserved' },
    },
    tracks: [
      {
        trackId: `${projectId}:track:1`,
        name,
        gainDb: 0,
        muted: false,
        solo: false,
        views: { rms: null, bands: null, spectrum: 'reserved' },
        media: null,
        slicing: {
          fadeoutMs: 0,
          noisegateDb: -48,
          noisegateEnabled: true,
          markers: [],
          bandDetection: {
            bands: { low: true, mid: true, high: true },
            thresholdDb: 6,
            minGapUnits: 1,
            snap: true,
          },
        },
        output: { baseName: defaultBaseName(''), clipStartNumber: 1, useFfNumbering: false },
      },
    ],
    bmhelper: null,
  };
}

/** A new project with the timing, processing settings and markers of a .wos file. */
export function projectFromWos(
  data: { bpm: number; shift: number; fadeoutMs: number; noisegateDb: number; markers: Uint8Array },
  name: string,
  projectId: string = crypto.randomUUID(),
): ProjectFile {
  if (data.markers.length !== MAX_TICKS)
    throw new ProjectFormatError('WOS marker map has an invalid length');
  const project = createEmptyProject(projectId, name);
  const fields = projectSchema.shape.tracks.element.shape.slicing.shape;
  project.timing = {
    bpm: parseStructure(projectSchema.shape.timing.shape.bpm, data.bpm),
    shiftTicks: parseStructure(projectSchema.shape.timing.shape.shiftTicks, data.shift),
  };
  const { slicing } = currentTrack(project);
  slicing.fadeoutMs = parseStructure(fields.fadeoutMs, data.fadeoutMs);
  slicing.noisegateDb = parseStructure(fields.noisegateDb, data.noisegateDb);
  slicing.markers = markerTicks(data.markers);
  return project;
}

/** The .wos fields of one track. */
export function projectToWos(project: ProjectDocument, trackId: string | null = null) {
  const { slicing } = currentTrack(project, trackId);
  const markers = new Uint8Array(MAX_TICKS);
  for (const tick of slicing.markers) markers[tick] = 1;
  return {
    bpm: project.timing.bpm,
    shift: project.timing.shiftTicks,
    fadeoutMs: slicing.fadeoutMs,
    noisegateDb: slicing.noisegateDb,
    markers,
  };
}
