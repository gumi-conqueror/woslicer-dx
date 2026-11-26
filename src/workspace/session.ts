import { currentTrack, parseProject } from '../project/codec';
import type { ProjectDocument } from '../project/schema';
import { MAX_TICKS, MEASURE_TICKS } from '../core/timebase';
import type { EditorStore } from '../slicing/editor-store';

/**
 * Recovery data version. Version 3 records (2.0 alphas with one track) are
 * read as well. A record of any other version is kept unchanged and reported;
 * the app never reinterprets it.
 */
export const SESSION_VERSION = 4;

type Read<T> = (value: unknown, project: ProjectDocument) => T | undefined;
const flag: Read<boolean> = (value) => (typeof value === 'boolean' ? value : undefined);
const numberIn =
  (min: number, max: number, integer = false): Read<number> =>
  (value) =>
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max &&
    (!integer || Number.isInteger(value))
      ? value
      : undefined;
const tick = numberIn(0, MAX_TICKS - 1, true);

/**
 * Editor state saved with recovery data, grouped by the state's owner. Each
 * entry is an editor store field and how to read it back; a value that does
 * not read back is dropped and the field keeps its current value.
 */
const SAVED_STATE = {
  view: {
    followPlayhead: flag,
    // A grid density divides the measure into whole ticks.
    grid: (value: unknown) =>
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 1 &&
      value <= MEASURE_TICKS &&
      MEASURE_TICKS % value === 0
        ? value
        : undefined,
    snap: flag,
    cursorTick: tick,
    selectedTicks: (value: unknown, project: ProjectDocument) =>
      Array.isArray(value)
        ? value
            .map((item: unknown) => tick(item, project))
            .filter(
              (item) => item !== undefined && currentTrack(project).slicing.markers.includes(item),
            )
        : undefined,
    scrollTick: numberIn(0, MAX_TICKS),
    pxPerTick: numberIn(0.02, 1e9),
  },
  calibration: {
    tapOffsetMs: numberIn(-2000, 2000),
  },
} satisfies Record<string, Partial<Record<keyof EditorStore, Read<unknown>>>>;

type Group = keyof typeof SAVED_STATE;
const GROUPS: readonly Group[] = ['view', 'calibration'];
export type SavedState = { [G in Group]: Record<string, unknown> };
const emptyState = (): SavedState => ({ view: {}, calibration: {} });

export interface EditorSession {
  version: typeof SESSION_VERSION;
  dirty: boolean;
  project: ProjectDocument;
  currentTrackId: string | null;
  /** Host bindings of each track's last opened audio, by track id. */
  files: Readonly<Record<string, { reference: string; name: string }>>;
  state: SavedState;
}
type FileBinding = { reference: string; name: string };
function fileBinding(value: unknown): FileBinding | null {
  return object(value) &&
    typeof value.reference === 'string' &&
    value.reference.length > 0 &&
    value.reference.length < 4096 &&
    typeof value.name === 'string'
    ? { reference: value.reference, name: value.name }
    : null;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads a version 3 or 4 record; returns null when it is not one. */
function parseEditorSession(input: Record<string, unknown>): EditorSession | null {
  let project: ProjectDocument;
  try {
    const parsed = parseProject(input.project);
    if (parsed.kind !== 'supported') return null;
    project = parsed.project;
  } catch {
    return null;
  }
  const raw = object(input.state) ? input.state : {};
  const state = emptyState();
  for (const group of GROUPS) {
    const fields: Record<string, Read<unknown>> = SAVED_STATE[group];
    const values = object(raw[group]) ? raw[group] : {};
    for (const [field, read] of Object.entries(fields)) {
      const value = read(values[field], project);
      if (value !== undefined) state[group][field] = value;
    }
  }
  const trackIds = new Set(project.tracks.map((track) => track.trackId));
  const files: Record<string, FileBinding> = {};
  if (input.version === 3) {
    // Version 3 projects had one track and one audio binding.
    const binding = fileBinding(input.lastFile);
    const first = project.tracks[0];
    if (binding && first) files[first.trackId] = binding;
  } else if (object(input.files))
    for (const [trackId, value] of Object.entries(input.files)) {
      const binding = fileBinding(value);
      if (binding && trackIds.has(trackId)) files[trackId] = binding;
    }
  const currentTrackId =
    typeof input.currentTrackId === 'string' && trackIds.has(input.currentTrackId)
      ? input.currentTrackId
      : null;
  return {
    version: SESSION_VERSION,
    dirty: typeof input.dirty === 'boolean' ? input.dirty : true,
    project,
    currentTrackId,
    files,
    state,
  };
}

export type SessionReadResult =
  | { kind: 'absent' }
  | { kind: 'restored'; session: EditorSession }
  | { kind: 'invalid'; raw: unknown }
  | { kind: 'earlier'; raw: unknown }
  | { kind: 'future'; raw: unknown; version: number }
  | { kind: 'read-failed'; error: unknown };

/** Classifies raw recovery storage contents; other versions and damaged input are kept, never reinterpreted. */
export function readEditorSession(input: unknown): SessionReadResult {
  if (input === null || input === undefined) return { kind: 'absent' };
  const version = object(input) && Number.isInteger(input.version) ? Number(input.version) : 0;
  if (version > SESSION_VERSION) return { kind: 'future', raw: input, version };
  // Versions 1 and 2, and the unversioned records before them, came from releases before 2.0.
  if (
    object(input) &&
    (version === 1 ||
      version === 2 ||
      (input.version === undefined && ('doc' in input || 'project' in input)))
  )
    return { kind: 'earlier', raw: input };
  const session =
    object(input) && (version === SESSION_VERSION || version === 3)
      ? parseEditorSession(input)
      : null;
  return session ? { kind: 'restored', session } : { kind: 'invalid', raw: input };
}

export function captureEditorSession(editor: EditorStore): EditorSession {
  const state = emptyState();
  for (const group of GROUPS)
    for (const field of Object.keys(SAVED_STATE[group])) {
      const value: unknown = Reflect.get(editor, field);
      state[group][field] = structuredClone(value);
    }
  return {
    version: SESSION_VERSION,
    dirty: editor.isDirty,
    project: editor.document,
    currentTrackId: editor.track.trackId,
    files: Object.fromEntries(
      [...editor.sessions].flatMap(([trackId, session]) =>
        session.lastFile ? [[trackId, session.lastFile]] : [],
      ),
    ),
    state,
  };
}

export function restoreEditorSession(editor: EditorStore, session: EditorSession): void {
  editor.replaceDocument(session.project, { saved: !session.dirty });
  if (session.currentTrackId) editor.selectTrack(session.currentTrackId);
  for (const values of Object.values(session.state)) Object.assign(editor, values);
  for (const [trackId, file] of Object.entries(session.files)) editor.setLastFile(file, trackId);
  editor.setSelectedTicks(editor.selectedTicks);
}
