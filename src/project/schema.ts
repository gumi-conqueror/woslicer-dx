import { z } from 'zod';
import { MAX_TICKS } from '../core/timebase';
import { bmhelperDocumentSchema } from './bmhelper';
import { audioFileFormatSchema } from '../core/audio-formats';

export const PROJECT_FORMAT = 'wosdx' as const;
export const PROJECT_SCHEMA_VERSION = 3 as const;
// Application memory budgets, not requirements of the original binary formats.
// The native host repeats them in src-tauri/src/files.rs and session.rs;
// scripts/native-consistency.test.mjs checks that the values agree.
/** Largest audio or exported file that the app reads or writes. */
export const MEDIA_FILE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const PROJECT_FILE_MAX_BYTES = 64 * 1024 * 1024;
export const SESSION_FILE_MAX_BYTES = PROJECT_FILE_MAX_BYTES + 1024 * 1024;
/** A byte budget as shown in messages: `2 GiB`, `64 MiB`. */
export function byteLimitText(bytes: number): string {
  const gib = bytes / 1024 ** 3;
  return Number.isInteger(gib) ? `${gib} GiB` : `${bytes / 1024 ** 2} MiB`;
}
export const PROJECT_MAX_TRACKS = 256;
export const PROJECT_MAX_MARKERS = 49_152;
export const PROJECT_MAX_FRAMES = 2_000_000_000;
export const PROJECT_MAX_GAIN_DB = 12;
export const PROJECT_MIN_GAIN_DB = -96;

/**
 * Ranges of editable numeric fields. The schema below, the editor inputs and
 * setters, and file imports all read these, so each limit is written once.
 */
export const FIELD_RANGES = {
  bpm: { min: Number.MIN_VALUE, max: 10000 },
  shiftTicks: { min: -1e9, max: 1e9 },
  fadeoutMs: { min: 0, max: 60000 },
  noisegateDb: { min: -200, max: 0 },
  playbackRate: { min: 0.25, max: 1.5 },
  clipStartNumber: { min: 0, max: 9999 },
  gainDb: { min: PROJECT_MIN_GAIN_DB, max: PROJECT_MAX_GAIN_DB },
} as const;
type Range = { readonly min: number; readonly max: number };

export function inRange(value: number, range: Range): boolean {
  return Number.isFinite(value) && value >= range.min && value <= range.max;
}

export function clampGainDb(value: number): number {
  return Math.max(FIELD_RANGES.gainDb.min, Math.min(FIELD_RANGES.gainDb.max, value));
}

/** Monitoring cue sounds; `off` plays none. */
export const CUE_MODES = ['off', 'cowbell', 'triangle', 'metronome'] as const;
export type CueMode = (typeof CUE_MODES)[number];

// Field structure and bounds live here; cross-reference and compatibility policies
// stay in codec.ts. Object schemas strip extensions from editable data.
const text = (max = 4096, min = 1) =>
  // Existing files measure strings in UTF-16 code units, not Unicode code points.
  z.string().refine((value) => value.length >= min && value.length <= max, {
    error: 'text length is outside its supported range',
  });
const integer = (min: number, max: number) => z.int().min(min).max(max);
const ranged = (range: Range) => z.number().min(range.min).max(range.max);
const gain = ranged(FIELD_RANGES.gainDb);
const markerKeySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);
export type MarkerKey = z.infer<typeof markerKeySchema>;

// Read only this envelope before deciding whether v1 validation applies.
export const projectHeaderSchema = z.object({
  format: z.literal(PROJECT_FORMAT),
  schemaVersion: integer(1, 1_000_000),
});

const originHintSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('desktop'), pathHint: text() }),
  z.object({
    kind: z.literal('browser'),
    name: text(1024),
    relativePathHint: text().optional(),
    lastModified: integer(0, Number.MAX_SAFE_INTEGER).optional(),
  }),
]);
// Both origin variants' keys are recognized, even when inactive.
export const originHintKeys = new Set(
  originHintSchema.options.flatMap((option) => Object.keys(option.shape)),
);

const mediaSchema = z.object({
  mediaId: text(128),
  name: text(1024),
  format: audioFileFormatSchema,
  byteLength: integer(0, 16 * 1024 * 1024 * 1024).nullable(),
  sampleRateHz: integer(1, 768000).nullable(),
  channels: integer(1, 64).nullable(),
  framesPerChannel: integer(0, PROJECT_MAX_FRAMES).nullable(),
  integrity: z
    .object({
      algorithm: z.literal('sha256'),
      digest: z
        .string()
        .regex(/^[0-9a-f]{64}$/i)
        .toLowerCase(),
    })
    .nullable(),
  originHint: originHintSchema.nullable(),
});
const slicingSchema = z.object({
  fadeoutMs: integer(FIELD_RANGES.fadeoutMs.min, FIELD_RANGES.fadeoutMs.max),
  noisegateDb: ranged(FIELD_RANGES.noisegateDb),
  noisegateEnabled: z.boolean(),
  markers: z.array(integer(0, MAX_TICKS - 1)).max(PROJECT_MAX_MARKERS),
  markerKeys: z
    .array(
      z.object({
        tick: integer(0, MAX_TICKS - 1),
        keys: z.array(markerKeySchema).min(1).max(7),
      }),
    )
    .max(PROJECT_MAX_MARKERS)
    .optional(),
  /** Ticks of linked markers. Tracks that list the same tick share that marker. */
  links: z
    .array(integer(0, MAX_TICKS - 1))
    .max(PROJECT_MAX_MARKERS)
    .optional(),
  bandDetection: z.object({
    bands: z.object({ low: z.boolean(), mid: z.boolean(), high: z.boolean() }),
    thresholdDb: z.number().min(0).max(120),
    minGapUnits: z.number().min(0).max(192),
    snap: z.boolean(),
  }),
});
const outputSchema = z.object({
  baseName: text(240, 0),
  clipStartNumber: integer(FIELD_RANGES.clipStartNumber.min, FIELD_RANGES.clipStartNumber.max),
  useFfNumbering: z.boolean(),
});

/** One track: a complete source file with its own markers and output settings. */
const trackSchema = z.object({
  trackId: text(128),
  name: text(512),
  gainDb: gain,
  muted: z.boolean(),
  solo: z.boolean(),
  views: z.object({
    rms: z.boolean().nullable(),
    bands: z.boolean().nullable(),
    spectrum: z
      .literal('reserved')
      .nullable()
      .transform(() => 'reserved' as const),
  }),
  /** One complete source file, or null before audio is chosen. */
  media: mediaSchema.nullable(),
  slicing: slicingSchema,
  output: outputSchema,
});

/** All tracks share the time base, the global playback settings and the BMHelper data. */
export const projectSchema = z.object({
  format: z.literal(PROJECT_FORMAT),
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  projectId: text(128),
  name: text(512),
  timing: z.object({
    bpm: ranged(FIELD_RANGES.bpm),
    shiftTicks: ranged(FIELD_RANGES.shiftTicks),
  }),
  global: z.object({
    masterGainDb: gain,
    masterMuted: z.boolean(),
    cueGainDb: gain,
    cueMode: z.enum(CUE_MODES),
    playbackRate: ranged(FIELD_RANGES.playbackRate),
    views: z.object({ rms: z.boolean(), bands: z.boolean(), spectrum: z.literal('reserved') }),
    /** Marker edits apply to every track through links, and new markers go to every track. */
    sharedMarkers: z.boolean(),
  }),
  tracks: z.array(trackSchema).min(1).max(PROJECT_MAX_TRACKS),
  bmhelper: bmhelperDocumentSchema.nullable(),
});

export type ProjectFile = z.infer<typeof projectSchema>;
export type ProjectTrack = ProjectFile['tracks'][number];
export type MediaAsset = NonNullable<ProjectTrack['media']>;
export type SlicingSettings = ProjectTrack['slicing'];
export type OutputRecipe = ProjectTrack['output'];

type Immutable<T> = { readonly [K in keyof T]: Immutable<T[K]> };
export type ProjectDocument = Immutable<ProjectFile>;

export type ProjectParseResult =
  | {
      kind: 'supported';
      project: ProjectFile;
      unknownFields: readonly string[];
    }
  | { kind: 'unsupported-version'; version: number; raw: unknown };
